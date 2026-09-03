/**
 * Deterministic development and e2e seed.
 *
 * Usage:
 *   npx tsx scripts/seed.ts
 *
 * Creates (idempotently, keyed by fixed wallet addresses and internal ids):
 *   - 1 admin user (retail type, settings.role = 'admin'; the schema has no
 *     admin user_type, the flag lives in settings until an admin surface
 *     lands),
 *   - 2 verified business users,
 *   - 3 investors (retail),
 *   - 3 assets: one draft ("Coming soon" card) and two active ones with
 *     different kyc_required flags, backed by fake mint data (nft ids 9001
 *     and 9002, fake token addresses) so UI development works without a
 *     chain. The e2e suite reseeds through this script.
 *
 * All writes go through the src/lib/db repositories with the service client
 * underneath; the only direct reads are idempotency lookups.
 */

import './lib/bootstrap';
import type { Json } from '../src/types/database';
import { createServiceClient } from '../src/lib/supabase/server';
import { unwrapMaybe } from '../src/lib/db/helpers';
import {
  setUserVerified,
  updateUserProfile,
  updateUserSettings,
  upsertUserOnLogin,
  type UserRow,
} from '../src/lib/db/users';
import { listCategories } from '../src/lib/db/categories';
import {
  createDraftAsset,
  getAssetByNftId,
  promoteAssetToActive,
  type AssetRow,
} from '../src/lib/db/assets';
import { createListing, getActiveListingsForAsset } from '../src/lib/db/listings';
import { applyHoldingDelta, getHolding, lockHoldingQuantity } from '../src/lib/db/holdings';

const CHAIN_ID = (() => {
  const parsed = Number.parseInt(process.env.NEXT_PUBLIC_THIRDWEB_CHAIN_ID ?? '', 10);
  return Number.isNaN(parsed) ? 31337 : parsed;
})();

const WALLETS = {
  admin: '0x1000000000000000000000000000000000000001',
  business1: '0x2000000000000000000000000000000000000001',
  business2: '0x2000000000000000000000000000000000000002',
  investor1: '0x3000000000000000000000000000000000000001',
  investor2: '0x3000000000000000000000000000000000000002',
  investor3: '0x3000000000000000000000000000000000000003',
} as const;

// Fake mint data for the two active assets (chain-shaped but not on chain).
const SEED_ASSETS = {
  draft: { internalId: 'seed-asset-draft-1' },
  activeOpen: {
    internalId: 'seed-asset-active-open',
    nftId: 9001,
    token: '0x4000000000000000000000000000000000009001',
    mintTxHash: `0x${'11'.repeat(32)}`,
    totalSupply: 1000,
    price: '25',
    kycRequired: false,
  },
  activeKyc: {
    internalId: 'seed-asset-active-kyc',
    nftId: 9002,
    token: '0x4000000000000000000000000000000000009002',
    mintTxHash: `0x${'22'.repeat(32)}`,
    totalSupply: 500,
    price: '100',
    kycRequired: true,
  },
} as const;

function log(message: string): void {
  console.log(`[seed] ${message}`);
}

async function seedUser(
  wallet: string,
  type: 'retail' | 'business',
  profile: { name?: string; display_name?: string; legal_name?: string; email?: string },
  options: { verified?: boolean; settings?: Record<string, unknown> } = {},
): Promise<UserRow> {
  let user = await upsertUserOnLogin(wallet, type);
  user = await updateUserProfile(user.id, profile);
  if (options.verified && !user.is_verified) {
    user = await setUserVerified(user.id, true);
  }
  if (options.settings) {
    const mergedSettings = {
      ...(typeof user.settings === 'object' && user.settings !== null && !Array.isArray(user.settings)
        ? (user.settings as Record<string, unknown>)
        : {}),
      ...options.settings,
    } as Json;
    user = await updateUserSettings(user.id, mergedSettings);
  }
  log(`user ${type} ${wallet} -> ${user.id}`);
  return user;
}

async function findAssetByInternalId(internalId: string): Promise<AssetRow | null> {
  const db = createServiceClient();
  const result = await db
    .from('assets')
    .select('*')
    .eq('internal_id', internalId)
    .maybeSingle();
  return unwrapMaybe(result, 'seed.findAssetByInternalId');
}

async function seedActiveAsset(
  business: UserRow,
  categoryId: string,
  spec: typeof SEED_ASSETS.activeOpen | typeof SEED_ASSETS.activeKyc,
  name: string,
  description: string,
): Promise<void> {
  let asset = await findAssetByInternalId(spec.internalId);
  if (!asset) {
    const byNft = await getAssetByNftId(spec.nftId);
    if (byNft) {
      asset = byNft;
    }
  }
  if (!asset) {
    asset = await createDraftAsset(business.id, {
      categoryId,
      name,
      chainId: CHAIN_ID,
      description,
      internalId: spec.internalId,
      totalSupply: spec.totalSupply,
      mintPricePerFraction: spec.price,
      kycRequired: spec.kycRequired,
      metadata: { seeded: true },
    });
    log(`asset created ${name} -> ${asset.id}`);
  }

  if (asset.status === 'draft' || asset.status === 'minting') {
    const promoted = await promoteAssetToActive(asset.id, {
      nftId: spec.nftId,
      erc20TokenAddress: spec.token,
      totalSupply: spec.totalSupply,
      mintTxHash: spec.mintTxHash,
    });
    if (promoted) {
      asset = promoted;
      log(`asset promoted ${name} (nft ${spec.nftId})`);
    }
  }

  const holding = await getHolding(business.id, asset.id);
  if (!holding || holding.quantity === 0) {
    const applied = await applyHoldingDelta({
      userId: business.id,
      assetId: asset.id,
      deltaQuantity: spec.totalSupply,
      priceForAvg: spec.price,
    });
    if (applied) {
      await lockHoldingQuantity(business.id, asset.id, spec.totalSupply);
      log(`holding seeded for ${name}: ${spec.totalSupply} locked`);
    }
  }

  const listings = await getActiveListingsForAsset(asset.id);
  const primary = listings.find((l) => l.kind === 'primary' && l.lister_id === business.id);
  if (!primary) {
    await createListing({
      assetId: asset.id,
      listerId: business.id,
      kind: 'primary',
      quantity: spec.totalSupply,
      pricePerFraction: spec.price,
      txHash: spec.mintTxHash,
    });
    log(`primary listing created for ${name}`);
  }
}

async function main(): Promise<void> {
  log(`seeding chain_id ${CHAIN_ID}`);

  const categories = await listCategories();
  if (categories.length === 0) {
    throw new Error(
      'No asset categories found. Apply the supabase migrations (including 20260903000005_seed_asset_categories.sql) first.',
    );
  }
  const categoryFor = (slug: string) =>
    categories.find((c) => c.slug === slug) ?? categories[0];

  await seedUser(
    WALLETS.admin,
    'retail',
    { name: 'Seed Admin', email: 'admin@seed.local' },
    { settings: { role: 'admin' } },
  );

  const business1 = await seedUser(
    WALLETS.business1,
    'business',
    {
      display_name: 'Falcon Ventures',
      legal_name: 'Falcon Ventures LLC',
      email: 'falcon@seed.local',
    },
    { verified: true },
  );
  const business2 = await seedUser(
    WALLETS.business2,
    'business',
    {
      display_name: 'Chrono Assets',
      legal_name: 'Chrono Assets FZE',
      email: 'chrono@seed.local',
    },
    { verified: true },
  );

  await seedUser(WALLETS.investor1, 'retail', { name: 'Ivy Investor', email: 'ivy@seed.local' });
  await seedUser(WALLETS.investor2, 'retail', { name: 'Ian Investor', email: 'ian@seed.local' });
  await seedUser(WALLETS.investor3, 'retail', { name: 'Iris Investor', email: 'iris@seed.local' });

  // Draft asset: visible as a "Coming soon" card, owned by business 2.
  const draft = await findAssetByInternalId(SEED_ASSETS.draft.internalId);
  if (!draft) {
    const created = await createDraftAsset(business2.id, {
      categoryId: categoryFor('watches').id,
      name: 'Vintage Chronograph Collection',
      chainId: CHAIN_ID,
      description: 'A curated collection of vintage chronographs. Coming soon.',
      internalId: SEED_ASSETS.draft.internalId,
      totalSupply: 2000,
      mintPricePerFraction: '50',
      kycRequired: false,
      metadata: { seeded: true },
    });
    log(`draft asset created -> ${created.id}`);
  } else {
    log('draft asset already present');
  }

  await seedActiveAsset(
    business1,
    categoryFor('falcons').id,
    SEED_ASSETS.activeOpen,
    'Champion Saker Falcon',
    'Fractional ownership of a champion Saker falcon. Open to everyone.',
  );
  await seedActiveAsset(
    business2,
    categoryFor('crypto-mining-farm').id,
    SEED_ASSETS.activeKyc,
    'Reykjavik Mining Facility',
    'Fractional ownership of an Icelandic mining facility. KYC required.',
  );

  log('done');
}

main().catch((error) => {
  console.error('[seed] failed:', error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
