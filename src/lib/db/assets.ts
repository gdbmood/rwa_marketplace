import 'server-only';

import type { Json } from '@/types/database';
import { createServiceClient } from '@/lib/supabase/server';
import {
  type Enum,
  type Row,
  type UpdateRow,
  type ViewRow,
  unwrap,
  unwrapMaybe,
} from '@/lib/db/helpers';
import { type NumericInput, numericColumn } from '@/lib/db/numeric';

export type AssetRow = Row<'assets'>;
export type AssetStatus = Enum<'asset_status'>;
export type MarketplaceAssetRow = ViewRow<'v_marketplace'>;

export interface CreateDraftAssetInput {
  categoryId: string;
  name: string;
  chainId: number;
  description?: string | null;
  metadata?: Json;
  internalId?: string | null;
  totalSupply?: number | null;
  valuation?: NumericInput | null;
  mintPricePerFraction?: NumericInput | null;
  kycRequired?: boolean;
}

export interface DraftAssetPatch {
  categoryId?: string;
  name?: string;
  description?: string | null;
  metadata?: Json;
  internalId?: string | null;
  totalSupply?: number | null;
  valuation?: NumericInput | null;
  mintPricePerFraction?: NumericInput | null;
  kycRequired?: boolean;
}

export interface PromoteAssetInput {
  nftId: number;
  erc20TokenAddress: string;
  totalSupply: number;
  mintTxHash: string;
}

export interface MarketplaceFilters {
  categorySlug?: string;
  status?: AssetStatus;
  search?: string;
}

export async function createDraftAsset(
  businessId: string,
  input: CreateDraftAssetInput,
): Promise<AssetRow> {
  const db = createServiceClient();
  const result = await db
    .from('assets')
    .insert({
      business_id: businessId,
      category_id: input.categoryId,
      name: input.name,
      chain_id: input.chainId,
      status: 'draft',
      description: input.description ?? null,
      metadata: input.metadata ?? {},
      internal_id: input.internalId ?? null,
      total_supply: input.totalSupply ?? null,
      valuation: input.valuation != null ? numericColumn(input.valuation) : null,
      mint_price_per_fraction:
        input.mintPricePerFraction != null ? numericColumn(input.mintPricePerFraction) : null,
      kyc_required: input.kycRequired ?? false,
    })
    .select('*')
    .single();
  return unwrap(result, 'assets.createDraftAsset');
}

/** Only mutates the caller's own asset and only while it is still a draft. */
export async function updateDraftAsset(
  assetId: string,
  businessId: string,
  patch: DraftAssetPatch,
): Promise<AssetRow | null> {
  const db = createServiceClient();

  const update: UpdateRow<'assets'> = {};
  if (patch.categoryId !== undefined) update.category_id = patch.categoryId;
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.metadata !== undefined) update.metadata = patch.metadata;
  if (patch.internalId !== undefined) update.internal_id = patch.internalId;
  if (patch.totalSupply !== undefined) update.total_supply = patch.totalSupply;
  if (patch.valuation !== undefined) {
    update.valuation = patch.valuation != null ? numericColumn(patch.valuation) : null;
  }
  if (patch.mintPricePerFraction !== undefined) {
    update.mint_price_per_fraction =
      patch.mintPricePerFraction != null ? numericColumn(patch.mintPricePerFraction) : null;
  }
  if (patch.kycRequired !== undefined) update.kyc_required = patch.kycRequired;

  const result = await db
    .from('assets')
    .update(update)
    .eq('id', assetId)
    .eq('business_id', businessId)
    .eq('status', 'draft')
    .select('*')
    .maybeSingle();
  return unwrapMaybe(result, 'assets.updateDraftAsset');
}

/** Draft to minting transition, recording the mint transaction hash. */
export async function setAssetMinting(
  assetId: string,
  businessId: string,
  mintTxHash: string,
): Promise<AssetRow | null> {
  const db = createServiceClient();
  const result = await db
    .from('assets')
    .update({ status: 'minting', mint_tx_hash: mintTxHash })
    .eq('id', assetId)
    .eq('business_id', businessId)
    .eq('status', 'draft')
    .select('*')
    .maybeSingle();
  return unwrapMaybe(result, 'assets.setAssetMinting');
}

/**
 * Called by the chain indexer once the mint is confirmed on-chain. Accepts
 * assets in draft or minting state (the indexer may observe the event before
 * the app recorded the minting transition).
 */
export async function promoteAssetToActive(
  assetId: string,
  { nftId, erc20TokenAddress, totalSupply, mintTxHash }: PromoteAssetInput,
): Promise<AssetRow | null> {
  const db = createServiceClient();
  const result = await db
    .from('assets')
    .update({
      status: 'active',
      nft_id: nftId,
      erc20_token_address: erc20TokenAddress.toLowerCase(),
      total_supply: totalSupply,
      available_supply: totalSupply,
      mint_tx_hash: mintTxHash,
    })
    .eq('id', assetId)
    .in('status', ['draft', 'minting'])
    .select('*')
    .maybeSingle();
  return unwrapMaybe(result, 'assets.promoteAssetToActive');
}

export async function getAssetById(assetId: string): Promise<AssetRow | null> {
  const db = createServiceClient();
  const result = await db.from('assets').select('*').eq('id', assetId).maybeSingle();
  return unwrapMaybe(result, 'assets.getAssetById');
}

export async function getAssetByNftId(nftId: number): Promise<AssetRow | null> {
  const db = createServiceClient();
  const result = await db.from('assets').select('*').eq('nft_id', nftId).maybeSingle();
  return unwrapMaybe(result, 'assets.getAssetByNftId');
}

export async function getAssetByErc20(tokenAddress: string): Promise<AssetRow | null> {
  const db = createServiceClient();
  const result = await db
    .from('assets')
    .select('*')
    .eq('erc20_token_address', tokenAddress.toLowerCase())
    .maybeSingle();
  return unwrapMaybe(result, 'assets.getAssetByErc20');
}

/** Marketplace read model. Defaults to active assets when no status filter is given. */
export async function listMarketplaceAssets(
  filters: MarketplaceFilters = {},
): Promise<MarketplaceAssetRow[]> {
  const db = createServiceClient();
  let query = db.from('v_marketplace').select('*');

  query = query.eq('status', filters.status ?? 'active');
  if (filters.categorySlug) {
    query = query.eq('category_slug', filters.categorySlug);
  }
  if (filters.search) {
    const escaped = filters.search.replace(/[%_\\]/g, (match) => `\\${match}`);
    query = query.ilike('name', `%${escaped}%`);
  }

  const result = await query.order('created_at', { ascending: false });
  return unwrap(result, 'assets.listMarketplaceAssets');
}

export async function listAssetsByBusiness(businessId: string): Promise<AssetRow[]> {
  const db = createServiceClient();
  const result = await db
    .from('assets')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });
  return unwrap(result, 'assets.listAssetsByBusiness');
}

export async function updateAssetSupply(
  assetId: string,
  availableSupply: number,
): Promise<AssetRow> {
  const db = createServiceClient();
  const result = await db
    .from('assets')
    .update({ available_supply: availableSupply })
    .eq('id', assetId)
    .select('*')
    .single();
  return unwrap(result, 'assets.updateAssetSupply');
}

export async function setAssetStatus(assetId: string, status: AssetStatus): Promise<AssetRow> {
  const db = createServiceClient();
  const result = await db
    .from('assets')
    .update({ status })
    .eq('id', assetId)
    .select('*')
    .single();
  return unwrap(result, 'assets.setAssetStatus');
}
