'use server';

import type { Json } from '@/types/database';
import { requireUser } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import { unwrapMaybe } from '@/lib/db/helpers';
import {
  type AssetRow,
  type DraftAssetPatch,
  type MarketplaceAssetRow,
  createDraftAsset as createDraftAssetRow,
  listAssetsByBusiness,
  setAssetMinting,
  updateDraftAsset as updateDraftAssetRow,
} from '@/lib/db/assets';
import { type ListingRow, getActiveListingsForAsset } from '@/lib/db/listings';
import { publicEnv } from '@/lib/env';
import { toNumericString } from '@/lib/db/numeric';
import { type ActionResult, err, ok, toActionError } from '@/actions/result';
import { cleanString, isPositiveInteger, isTxHash, isUuid } from '@/actions/validate';

const MAX_ASSET_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_INTERNAL_ID_LENGTH = 64;

export interface DraftAssetInput {
  categoryId?: string;
  name?: string;
  description?: string | null;
  metadata?: Json;
  internalId?: string | null;
  totalSupply?: number | null;
  valuation?: string | number | null;
  mintPricePerFraction?: string | number | null;
  kycRequired?: boolean;
}

export interface AssetDetail {
  asset: MarketplaceAssetRow;
  /** Active listings, cheapest first. Empty until the asset is live. */
  listings: ListingRow[];
}

interface ValidatedDraft {
  patch: DraftAssetPatch;
  error: string | null;
}

function validateDraftInput(input: DraftAssetInput): ValidatedDraft {
  const patch: DraftAssetPatch = {};

  if (input.categoryId !== undefined) {
    if (!isUuid(input.categoryId)) {
      return { patch, error: 'categoryId must be a valid id' };
    }
    patch.categoryId = input.categoryId;
  }
  if (input.name !== undefined) {
    const name = cleanString(input.name, MAX_ASSET_NAME_LENGTH);
    if (!name) {
      return { patch, error: 'Asset name must be a non-empty string' };
    }
    patch.name = name;
  }
  if (input.description !== undefined) {
    if (input.description === null) {
      patch.description = null;
    } else {
      const description = cleanString(input.description, MAX_DESCRIPTION_LENGTH);
      if (!description) {
        return { patch, error: 'Description is not valid' };
      }
      patch.description = description;
    }
  }
  if (input.metadata !== undefined) {
    if (
      typeof input.metadata !== 'object' ||
      input.metadata === null ||
      Array.isArray(input.metadata)
    ) {
      return { patch, error: 'metadata must be an object' };
    }
    patch.metadata = input.metadata;
  }
  if (input.internalId !== undefined) {
    if (input.internalId === null) {
      patch.internalId = null;
    } else {
      const internalId = cleanString(input.internalId, MAX_INTERNAL_ID_LENGTH);
      if (!internalId) {
        return { patch, error: 'internalId is not valid' };
      }
      patch.internalId = internalId;
    }
  }
  if (input.totalSupply !== undefined) {
    if (input.totalSupply !== null && !isPositiveInteger(input.totalSupply)) {
      return { patch, error: 'totalSupply must be a positive integer' };
    }
    patch.totalSupply = input.totalSupply;
  }
  if (input.valuation !== undefined) {
    if (input.valuation === null) {
      patch.valuation = null;
    } else {
      try {
        patch.valuation = toNumericString(input.valuation);
      } catch {
        return { patch, error: 'valuation must be a USDC amount' };
      }
    }
  }
  if (input.mintPricePerFraction !== undefined) {
    if (input.mintPricePerFraction === null) {
      patch.mintPricePerFraction = null;
    } else {
      try {
        patch.mintPricePerFraction = toNumericString(input.mintPricePerFraction);
      } catch {
        return { patch, error: 'mintPricePerFraction must be a USDC amount' };
      }
    }
  }
  if (input.kycRequired !== undefined) {
    if (typeof input.kycRequired !== 'boolean') {
      return { patch, error: 'kycRequired must be a boolean' };
    }
    patch.kycRequired = input.kycRequired;
  }

  return { patch, error: null };
}

/** Creates a draft asset (visible as Coming soon) for the calling business. */
export async function createDraftAsset(
  input: DraftAssetInput,
): Promise<ActionResult<AssetRow>> {
  try {
    const { user } = await requireUser();
    if (user.type !== 'business') {
      return err('forbidden', 'Only business accounts can create assets');
    }

    const { patch, error } = validateDraftInput(input);
    if (error) {
      return err('invalid_input', error);
    }
    if (!patch.categoryId || !patch.name) {
      return err('invalid_input', 'categoryId and name are required');
    }

    const asset = await createDraftAssetRow(user.id, {
      categoryId: patch.categoryId,
      name: patch.name,
      chainId: publicEnv.thirdwebChainId,
      description: patch.description ?? null,
      metadata: patch.metadata,
      internalId: patch.internalId ?? null,
      totalSupply: patch.totalSupply ?? null,
      valuation: patch.valuation ?? null,
      mintPricePerFraction: patch.mintPricePerFraction ?? null,
      kycRequired: patch.kycRequired ?? false,
    });
    return ok(asset);
  } catch (error) {
    return toActionError(error, 'assets.createDraftAsset');
  }
}

/** Updates a draft owned by the caller. Fails once the asset left draft state. */
export async function updateDraftAsset(
  assetId: string,
  input: DraftAssetInput,
): Promise<ActionResult<AssetRow>> {
  try {
    const { user } = await requireUser();
    if (user.type !== 'business') {
      return err('forbidden', 'Only business accounts can update assets');
    }
    if (!isUuid(assetId)) {
      return err('invalid_input', 'assetId must be a valid id');
    }

    const { patch, error } = validateDraftInput(input);
    if (error) {
      return err('invalid_input', error);
    }
    if (Object.keys(patch).length === 0) {
      return err('invalid_input', 'Nothing to update');
    }

    const updated = await updateDraftAssetRow(assetId, user.id, patch);
    if (!updated) {
      return err('not_found', 'Draft not found, not yours, or no longer editable');
    }
    return ok(updated);
  } catch (error) {
    return toActionError(error, 'assets.updateDraftAsset');
  }
}

/** All assets belonging to the calling business, drafts included. */
export async function listMyAssets(): Promise<ActionResult<AssetRow[]>> {
  try {
    const { user } = await requireUser();
    if (user.type !== 'business') {
      return err('forbidden', 'Only business accounts have assets');
    }
    const assets = await listAssetsByBusiness(user.id);
    return ok(assets);
  } catch (error) {
    return toActionError(error, 'assets.listMyAssets');
  }
}

/**
 * Public asset detail: the v_marketplace row (business display name, category,
 * floor price) plus active listings cheapest first. Accepts either the asset
 * uuid or the on-chain NFT id. No auth by design.
 */
export async function getAssetDetail(
  assetIdOrNftId: string | number,
): Promise<ActionResult<AssetDetail>> {
  try {
    const db = createServiceClient();
    let query = db.from('v_marketplace').select('*');

    if (typeof assetIdOrNftId === 'string' && isUuid(assetIdOrNftId)) {
      query = query.eq('asset_id', assetIdOrNftId);
    } else {
      const nftId = Number(assetIdOrNftId);
      if (!Number.isInteger(nftId) || nftId < 0) {
        return err('invalid_input', 'Provide an asset id or an NFT id');
      }
      query = query.eq('nft_id', nftId);
    }

    const result = await query.maybeSingle();
    const asset = unwrapMaybe(result, 'actions.getAssetDetail');
    if (!asset || !asset.asset_id) {
      return err('not_found', 'Asset not found');
    }

    const listings =
      asset.status === 'active' ? await getActiveListingsForAsset(asset.asset_id) : [];
    return ok({ asset, listings });
  } catch (error) {
    return toActionError(error, 'assets.getAssetDetail');
  }
}

/**
 * Records the mint transaction hash and moves the caller's draft to minting.
 * The indexer promotes it to active once NFTFractionalized is observed.
 */
export async function markAssetMinting(
  assetId: string,
  mintTxHash: string,
): Promise<ActionResult<AssetRow>> {
  try {
    const { user } = await requireUser();
    if (user.type !== 'business') {
      return err('forbidden', 'Only business accounts can mint assets');
    }
    if (!isUuid(assetId)) {
      return err('invalid_input', 'assetId must be a valid id');
    }
    if (!isTxHash(mintTxHash)) {
      return err('invalid_input', 'mintTxHash must be a transaction hash');
    }

    const updated = await setAssetMinting(assetId, user.id, mintTxHash);
    if (!updated) {
      return err('conflict', 'Asset is not one of your drafts');
    }
    return ok(updated);
  } catch (error) {
    return toActionError(error, 'assets.markAssetMinting');
  }
}
