/**
 * Data orchestration for the investor journey spec (e2e/specs/investor.spec.ts).
 *
 * Three jobs:
 *
 * 1. resetStaleChainState: the database is REMOTE and survives runs, while
 *    global teardown kills the hardhat node, so every full run starts a FRESH
 *    deterministic chain against a database still holding the previous
 *    chain's rows. Without a guard that breaks run 2+ three ways:
 *      - indexer_cursors can point past the fresh chain's tip, so ingestion
 *        silently fetches nothing;
 *      - chain_events rows dedupe on (chain_id, tx_hash, log_index), and a
 *        deterministic fresh chain can reproduce old transaction hashes, so
 *        new events would be treated as already processed;
 *      - assets hold UNIQUE nft_id / erc20_token_address values that the
 *        fresh chain re-issues (nft ids restart at 0, token addresses come
 *        from the marketplace's reset nonce), so the next mint promotion
 *        would violate those constraints.
 *    The guard detects rows whose transactions the running node has never
 *    seen and retires them (events + cursors deleted, assets delisted with
 *    their chain identity nulled, their listings canceled). Seeded fake
 *    assets (scripts/seed.ts) are preserved by internal id.
 *
 * 2. mintInvestorAsset: mints a REAL on-chain asset for the journeys. The
 *    seeded "active" assets carry fake nft ids that do not exist on the
 *    local chain, so buying them would revert; the investor journeys need a
 *    genuine mint (business1 wallet), the indexer's promotion to active, and
 *    the business's ERC20 allowance to the marketplace.
 *
 * 3. createCardFailAsset: a database-only active asset priced so that one
 *    fraction plus the platform fee totals exactly 13 USDC, the mock onramp
 *    provider's magic failing fiat amount (src/lib/onramp/mock.ts). The card
 *    failure path never reaches the chain, so fake mint data is fine here,
 *    exactly like scripts/seed.ts does.
 */

import '../../scripts/lib/bootstrap';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '../../src/types/database';
import {
  createDraftAsset,
  getAssetById,
  promoteAssetToActive,
  setAssetMinting,
  type AssetRow,
} from '../../src/lib/db/assets';
import { listCategories } from '../../src/lib/db/categories';
import { createListing, getActiveListingsForAsset } from '../../src/lib/db/listings';
import { applyHoldingDelta, getHolding, lockHoldingQuantity } from '../../src/lib/db/holdings';
import { getUserByWallet, type UserRow } from '../../src/lib/db/users';
import { CHAIN_ID, readChainJson, rpcCall } from '../stack';
import { HARDHAT_ACCOUNT_INDEX, WALLETS, type WalletRole } from '../wallets';
import {
  approveFractionsForMarketplace,
  mintAndFractionalizeOnChain,
} from './node-wallet';

export type ServiceClient = SupabaseClient<Database>;

/**
 * Per-worker run tag. Playwright serial mode restarts the worker (and thus
 * this module) on a retry, so every attempt mints fresh, uniquely named
 * assets and every assertion can be absolute instead of delta-based.
 */
export const RUN_TAG = Date.now().toString(36);
const RUN_HEX = Date.now().toString(16);

export const MAIN_ASSET_NAME = `E2E Falcon ${RUN_TAG}`;
export const MAIN_ASSET_SUPPLY = 100;
export const MAIN_ASSET_PRICE = '10';
export const MAIN_DOC_GROUP = 'Ownership Rights';
export const MAIN_DOC_URL = 'https://example.com/e2e/ownership-proof.pdf';

export const FAIL_ASSET_NAME = `E2E Card Fail ${RUN_TAG}`;
/**
 * One fraction at this price quotes 12.987013 USDC; the half-up platform fee
 * at the contract's 10 bps adds 0.012987, so the onramp token amount is
 * exactly 13 USDC = MOCK_FAIL_FIAT_AMOUNT (src/lib/onramp/mock.ts) and the
 * mock provider fails the session right after "pending".
 */
export const FAIL_ASSET_PRICE = '12.987013';
export const FAIL_ASSET_SUPPLY = 10;

/** Seeded assets from scripts/seed.ts that the stale guard must never touch. */
const SEED_INTERNAL_IDS = new Set([
  'seed-asset-draft-1',
  'seed-asset-active-open',
  'seed-asset-active-kyc',
]);

const MAIN_INTERNAL_ID = `e2e-inv-main-${RUN_TAG}`;
const FAIL_INTERNAL_ID = `e2e-inv-fail-${RUN_TAG}`;

function log(message: string): void {
  console.log(`[investor-spec] ${message}`);
}

// -- generic waiting ----------------------------------------------------------

export interface WaitOptions {
  timeoutMs?: number;
  intervalMs?: number;
  label: string;
}

/** Polls until fn returns a truthy value; throws a labeled timeout error. */
export async function waitFor<T>(
  fn: () => Promise<T | null | undefined | false>,
  { timeoutMs = 30_000, intervalMs = 1_000, label }: WaitOptions,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;
  for (;;) {
    try {
      const value = await fn();
      if (value) {
        return value;
      }
    } catch (error) {
      lastError = error;
    }
    if (Date.now() >= deadline) {
      const suffix =
        lastError instanceof Error ? ` (last error: ${lastError.message})` : '';
      throw new Error(`Timed out after ${timeoutMs}ms waiting for ${label}${suffix}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

// -- chain probes -------------------------------------------------------------

async function latestBlockNumber(): Promise<number> {
  const hex = await rpcCall<string>('eth_blockNumber');
  return Number.parseInt(hex, 16);
}

async function txKnownToNode(txHash: string): Promise<boolean> {
  const tx = await rpcCall<unknown>('eth_getTransactionByHash', [txHash]);
  return tx !== null && tx !== undefined;
}

function chunk<T>(values: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size));
  }
  return out;
}

// -- stale chain-state guard --------------------------------------------------

export interface StaleResetReport {
  staleEventTxCount: number;
  cursorsDeleted: boolean;
  retiredAssetIds: string[];
}

export async function resetStaleChainState(db: ServiceClient): Promise<StaleResetReport> {
  const report: StaleResetReport = {
    staleEventTxCount: 0,
    cursorsDeleted: false,
    retiredAssetIds: [],
  };
  const latest = await latestBlockNumber();

  // 1. chain_events rows from a chain this node has never seen.
  const eventsResult = await db
    .from('chain_events')
    .select('tx_hash')
    .eq('chain_id', CHAIN_ID)
    .limit(5000);
  if (eventsResult.error) {
    throw new Error(`stale guard: chain_events read failed: ${eventsResult.error.message}`);
  }
  const txHashes = Array.from(new Set(eventsResult.data.map((row) => row.tx_hash)));
  const staleHashes: string[] = [];
  for (const hash of txHashes) {
    if (!(await txKnownToNode(hash))) {
      staleHashes.push(hash);
    }
  }
  if (staleHashes.length > 0) {
    for (const part of chunk(staleHashes, 100)) {
      const del = await db
        .from('chain_events')
        .delete()
        .eq('chain_id', CHAIN_ID)
        .in('tx_hash', part);
      if (del.error) {
        throw new Error(`stale guard: chain_events delete failed: ${del.error.message}`);
      }
    }
    report.staleEventTxCount = staleHashes.length;
    log(`removed chain_events for ${staleHashes.length} transaction(s) from a dead chain`);
  }

  // 2. Cursor: stale events mean the cursor tracked the dead chain; a cursor
  //    past the fresh chain's tip blocks ingestion entirely even without them.
  const cursorResult = await db
    .from('indexer_cursors')
    .select('last_block')
    .eq('chain_id', CHAIN_ID);
  if (cursorResult.error) {
    throw new Error(`stale guard: cursor read failed: ${cursorResult.error.message}`);
  }
  const cursorAhead = cursorResult.data.some((row) => Number(row.last_block) > latest);
  if (staleHashes.length > 0 || cursorAhead) {
    const del = await db.from('indexer_cursors').delete().eq('chain_id', CHAIN_ID);
    if (del.error) {
      throw new Error(`stale guard: cursor delete failed: ${del.error.message}`);
    }
    report.cursorsDeleted = true;
    log('reset the local-chain indexer cursor');
  }

  // 3. Assets whose mint transaction the node does not know: their nft_id and
  //    erc20_token_address are UNIQUE columns the fresh chain will re-issue.
  const assetsResult = await db
    .from('assets')
    .select('id, name, internal_id, mint_tx_hash, erc20_token_address')
    .eq('chain_id', CHAIN_ID)
    .not('erc20_token_address', 'is', null);
  if (assetsResult.error) {
    throw new Error(`stale guard: assets read failed: ${assetsResult.error.message}`);
  }
  for (const asset of assetsResult.data) {
    if (asset.internal_id && SEED_INTERNAL_IDS.has(asset.internal_id)) {
      continue;
    }
    if (!asset.mint_tx_hash) {
      continue; // unknown provenance; leave it alone
    }
    if (await txKnownToNode(asset.mint_tx_hash)) {
      continue; // lives on the current chain
    }
    const update = await db
      .from('assets')
      .update({
        status: 'delisted',
        nft_id: null,
        erc20_token_address: null,
        mint_tx_hash: null,
      })
      .eq('id', asset.id);
    if (update.error) {
      throw new Error(
        `stale guard: retiring asset ${asset.id} (${asset.name}) failed: ${update.error.message}`,
      );
    }
    report.retiredAssetIds.push(asset.id);
  }
  if (report.retiredAssetIds.length > 0) {
    const listings = await db
      .from('listings')
      .update({ status: 'canceled' })
      .in('asset_id', report.retiredAssetIds)
      .eq('status', 'active');
    if (listings.error) {
      throw new Error(`stale guard: listing cancel failed: ${listings.error.message}`);
    }
    log(`retired ${report.retiredAssetIds.length} asset(s) minted on a dead chain`);
  }

  return report;
}

/**
 * Convenience wrapper that builds the service client itself (env from
 * .env.local via the bootstrap import). The guard benefits every spec that
 * touches the chain, so the recommended long-term home for this call is
 * e2e/global-setup.ts, before scripts/seed.ts runs:
 *
 *   await resetStaleChainStateWithServiceClient();
 */
export async function resetStaleChainStateWithServiceClient(): Promise<StaleResetReport> {
  const { createServiceClient } = await import('../../src/lib/supabase/server');
  return resetStaleChainState(createServiceClient());
}

// -- wallet / user plumbing ---------------------------------------------------

/** Private key of a role's funded hardhat account, from e2e/.chain.json. */
export function privateKeyFor(role: WalletRole): string {
  const parsed = readChainJson();
  if (!parsed) {
    throw new Error('e2e/.chain.json is missing; run the suite through `npm run e2e`.');
  }
  const account = parsed.accounts[HARDHAT_ACCOUNT_INDEX[role]];
  if (!account || account.address.toLowerCase() !== WALLETS[role].toLowerCase()) {
    throw new Error(
      `Funded account for "${role}" does not match e2e/wallets.ts; delete e2e/.chain.json and rerun.`,
    );
  }
  return account.privateKey;
}

async function requireSeededUser(role: WalletRole): Promise<UserRow> {
  const user = await getUserByWallet(WALLETS[role]);
  if (!user) {
    throw new Error(
      `Seeded user for "${role}" (${WALLETS[role]}) is missing. Run scripts/seed.ts (global setup does this).`,
    );
  }
  return user;
}

async function falconsCategoryId(): Promise<string> {
  const categories = await listCategories();
  if (categories.length === 0) {
    throw new Error('No asset categories found; apply the supabase migrations first.');
  }
  return (categories.find((c) => c.slug === 'falcons') ?? categories[0]).id;
}

// -- journey assets -----------------------------------------------------------

/**
 * Mints the main investor-journey asset ON CHAIN as business1 and waits for
 * the indexer to promote it (status active, nft id, fraction token, primary
 * listing, business holding), then grants the marketplace the fraction
 * allowance that buyFractions requires from the seller.
 *
 * kyc_required is true so the KYC gate can be exercised against a genuinely
 * buyable asset; the journey approves the investor through the signed Sumsub
 * webhook before purchasing.
 */
export async function mintInvestorAsset(): Promise<AssetRow> {
  const business = await requireSeededUser('business1');
  const categoryId = await falconsCategoryId();

  const draft = await createDraftAsset(business.id, {
    categoryId,
    name: MAIN_ASSET_NAME,
    chainId: CHAIN_ID,
    description:
      'End-to-end journey asset: a champion Saker falcon minted on the local test chain.',
    internalId: MAIN_INTERNAL_ID,
    totalSupply: MAIN_ASSET_SUPPLY,
    mintPricePerFraction: MAIN_ASSET_PRICE,
    kycRequired: true,
    metadata: {
      breed: 'Saker',
      documentUrls: { [MAIN_DOC_GROUP]: [MAIN_DOC_URL] },
      e2eRun: RUN_TAG,
    } as Json,
  });
  log(`draft asset created ${draft.id} (${MAIN_ASSET_NAME})`);

  const businessKey = privateKeyFor('business1');
  // The internal id in the metadata keeps the calldata (and so the tx hash)
  // unique per run; see the module comment on chain_events deduplication.
  const mintTxHash = await mintAndFractionalizeOnChain(businessKey, {
    totalSupply: MAIN_ASSET_SUPPLY,
    priceUsdc: MAIN_ASSET_PRICE,
    metadata: JSON.stringify({ name: MAIN_ASSET_NAME, internalId: MAIN_INTERNAL_ID }),
  });
  log(`mint transaction sent ${mintTxHash}`);

  const minting = await setAssetMinting(draft.id, business.id, mintTxHash);
  if (!minting) {
    throw new Error(`Could not move asset ${draft.id} to minting (already promoted?)`);
  }

  const active = await waitFor(
    async () => {
      const row = await getAssetById(draft.id);
      return row && row.status === 'active' && row.erc20_token_address && row.nft_id !== null
        ? row
        : null;
    },
    {
      timeoutMs: 90_000,
      intervalMs: 2_000,
      label: `indexer promotion of ${MAIN_ASSET_NAME} (is scripts/indexer.ts running? see e2e/.pids/indexer.log)`,
    },
  );

  await waitFor(
    async () => {
      const listings = await getActiveListingsForAsset(active.id);
      return listings.some((l) => l.kind === 'primary' && l.lister_id === business.id);
    },
    { timeoutMs: 30_000, intervalMs: 1_000, label: 'primary listing creation by the indexer' },
  );

  await approveFractionsForMarketplace(
    businessKey,
    active.erc20_token_address as string,
    MAIN_ASSET_SUPPLY,
  );
  log(`asset active (nft ${active.nft_id}), marketplace allowance granted`);

  return active;
}

/**
 * Database-only active asset for the card-failure path (mirrors the fake
 * mint data pattern of scripts/seed.ts; the flow fails before any chain
 * interaction). Fake identifiers are unique per run so the assets UNIQUE
 * constraints never trip across accumulated runs.
 */
export async function createCardFailAsset(): Promise<AssetRow> {
  const business = await requireSeededUser('business1');
  const categoryId = await falconsCategoryId();

  const fakeNftId = 9_000_000 + (Date.now() % 1_000_000);
  const fakeToken = `0x9e2e${RUN_HEX}`.padEnd(42, '0').toLowerCase();
  const fakeMintTx = `0xe2ef${RUN_HEX}`.padEnd(66, '0').toLowerCase();

  const draft = await createDraftAsset(business.id, {
    categoryId,
    name: FAIL_ASSET_NAME,
    chainId: CHAIN_ID,
    description: 'End-to-end card-failure asset (mock onramp magic amount).',
    internalId: FAIL_INTERNAL_ID,
    totalSupply: FAIL_ASSET_SUPPLY,
    mintPricePerFraction: FAIL_ASSET_PRICE,
    kycRequired: false,
    metadata: { e2eRun: RUN_TAG } as Json,
  });

  const promoted = await promoteAssetToActive(draft.id, {
    nftId: fakeNftId,
    erc20TokenAddress: fakeToken,
    totalSupply: FAIL_ASSET_SUPPLY,
    mintTxHash: fakeMintTx,
  });
  if (!promoted) {
    throw new Error(`Could not promote card-fail asset ${draft.id}`);
  }

  const holding = await getHolding(business.id, promoted.id);
  if (!holding || holding.quantity === 0) {
    const applied = await applyHoldingDelta({
      userId: business.id,
      assetId: promoted.id,
      deltaQuantity: FAIL_ASSET_SUPPLY,
      priceForAvg: FAIL_ASSET_PRICE,
    });
    if (applied) {
      await lockHoldingQuantity(business.id, promoted.id, FAIL_ASSET_SUPPLY);
    }
  }

  const listings = await getActiveListingsForAsset(promoted.id);
  if (!listings.some((l) => l.kind === 'primary' && l.lister_id === business.id)) {
    await createListing({
      assetId: promoted.id,
      listerId: business.id,
      kind: 'primary',
      quantity: FAIL_ASSET_SUPPLY,
      pricePerFraction: FAIL_ASSET_PRICE,
      txHash: fakeMintTx,
    });
  }
  log(`card-fail asset ready ${promoted.id} (${FAIL_ASSET_NAME})`);

  return promoted;
}

// -- typed query helpers for spec assertions ----------------------------------

export type OrderRow = Database['public']['Tables']['orders']['Row'];
export type HoldingRow = Database['public']['Tables']['holdings']['Row'];
export type ListingRowT = Database['public']['Tables']['listings']['Row'];
export type OnrampSessionRowT = Database['public']['Tables']['onramp_sessions']['Row'];
export type TransactionRowT = Database['public']['Tables']['transactions']['Row'];

/** Numeric columns arrive as strings on the wire; compare as numbers. */
export function num(value: unknown): number {
  return Number(value);
}

/** users.settings narrowed to a plain object. */
export function settingsOf(user: { settings: Json | null }): Record<string, unknown> {
  const raw = user.settings;
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

export async function latestOrderFor(
  db: ServiceClient,
  buyerId: string,
  assetId: string,
): Promise<OrderRow | null> {
  const result = await db
    .from('orders')
    .select('*')
    .eq('buyer_id', buyerId)
    .eq('asset_id', assetId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) {
    throw new Error(`latestOrderFor failed: ${result.error.message}`);
  }
  return result.data;
}

export async function holdingFor(
  db: ServiceClient,
  userId: string,
  assetId: string,
): Promise<HoldingRow | null> {
  const result = await db
    .from('holdings')
    .select('*')
    .eq('user_id', userId)
    .eq('asset_id', assetId)
    .maybeSingle();
  if (result.error) {
    throw new Error(`holdingFor failed: ${result.error.message}`);
  }
  return result.data;
}

export async function listingsFor(
  db: ServiceClient,
  assetId: string,
  filters: { kind?: 'primary' | 'secondary'; listerId?: string; status?: 'active' | 'filled' | 'canceled' } = {},
): Promise<ListingRowT[]> {
  let query = db.from('listings').select('*').eq('asset_id', assetId);
  if (filters.kind) {
    query = query.eq('kind', filters.kind);
  }
  if (filters.listerId) {
    query = query.eq('lister_id', filters.listerId);
  }
  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  const result = await query.order('created_at', { ascending: false });
  if (result.error) {
    throw new Error(`listingsFor failed: ${result.error.message}`);
  }
  return result.data;
}

export async function onrampSessionForOrder(
  db: ServiceClient,
  orderId: string,
): Promise<OnrampSessionRowT | null> {
  const result = await db
    .from('onramp_sessions')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) {
    throw new Error(`onrampSessionForOrder failed: ${result.error.message}`);
  }
  return result.data;
}

export async function transactionsFor(
  db: ServiceClient,
  assetId: string,
  type?: Database['public']['Enums']['tx_type'],
): Promise<TransactionRowT[]> {
  let query = db.from('transactions').select('*').eq('asset_id', assetId);
  if (type) {
    query = query.eq('type', type);
  }
  const result = await query.order('created_at', { ascending: false });
  if (result.error) {
    throw new Error(`transactionsFor failed: ${result.error.message}`);
  }
  return result.data;
}
