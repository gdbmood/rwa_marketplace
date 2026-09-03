import 'server-only';

import { createServiceClient } from '@/lib/supabase/server';
import { type Enum, type Row, unwrap, unwrapMaybe } from '@/lib/db/helpers';
import { type NumericInput, numericColumn } from '@/lib/db/numeric';

export type ListingRow = Row<'listings'>;
export type ListingKind = Enum<'listing_kind'>;

export interface CreateListingInput {
  assetId: string;
  listerId: string;
  kind: ListingKind;
  quantity: number;
  pricePerFraction: NumericInput;
  txHash?: string | null;
}

export async function createListing(input: CreateListingInput): Promise<ListingRow> {
  const db = createServiceClient();
  const result = await db
    .from('listings')
    .insert({
      asset_id: input.assetId,
      lister_id: input.listerId,
      kind: input.kind,
      quantity: input.quantity,
      original_quantity: input.quantity,
      price_per_fraction: numericColumn(input.pricePerFraction),
      status: 'active',
      tx_hash: input.txHash ?? null,
    })
    .select('*')
    .single();
  return unwrap(result, 'listings.createListing');
}

export async function getActiveListingsForAsset(assetId: string): Promise<ListingRow[]> {
  const db = createServiceClient();
  const result = await db
    .from('listings')
    .select('*')
    .eq('asset_id', assetId)
    .eq('status', 'active')
    .order('price_per_fraction', { ascending: true })
    .order('created_at', { ascending: true });
  return unwrap(result, 'listings.getActiveListingsForAsset');
}

/**
 * Compare-and-swap decrement: the update only applies while the listing is
 * still active and its quantity matches the value just read, so two
 * concurrent fills cannot double-consume. Sets status to filled at zero.
 * Returns the updated row, or null when the guard fails (insufficient
 * quantity or a concurrent write) so the caller can retry.
 */
export async function decrementListingQuantity(
  listingId: string,
  by: number,
): Promise<ListingRow | null> {
  if (!Number.isInteger(by) || by <= 0) {
    throw new Error(`listings.decrementListingQuantity: invalid decrement ${by}`);
  }
  const db = createServiceClient();

  const current = await db
    .from('listings')
    .select('*')
    .eq('id', listingId)
    .eq('status', 'active')
    .maybeSingle();
  const listing = unwrapMaybe(current, 'listings.decrementListingQuantity');
  if (!listing || listing.quantity < by) {
    return null;
  }

  const newQuantity = listing.quantity - by;
  const result = await db
    .from('listings')
    .update({
      quantity: newQuantity,
      status: newQuantity === 0 ? 'filled' : 'active',
    })
    .eq('id', listingId)
    .eq('status', 'active')
    .eq('quantity', listing.quantity)
    .select('*')
    .maybeSingle();
  return unwrapMaybe(result, 'listings.decrementListingQuantity');
}

export async function cancelListing(
  listingId: string,
  listerId: string,
): Promise<ListingRow | null> {
  const db = createServiceClient();
  const result = await db
    .from('listings')
    .update({ status: 'canceled' })
    .eq('id', listingId)
    .eq('lister_id', listerId)
    .eq('status', 'active')
    .select('*')
    .maybeSingle();
  return unwrapMaybe(result, 'listings.cancelListing');
}

export async function updateListingPrice(
  listingId: string,
  listerId: string,
  newPrice: NumericInput,
): Promise<ListingRow | null> {
  const db = createServiceClient();
  const result = await db
    .from('listings')
    .update({ price_per_fraction: numericColumn(newPrice) })
    .eq('id', listingId)
    .eq('lister_id', listerId)
    .eq('status', 'active')
    .select('*')
    .maybeSingle();
  return unwrapMaybe(result, 'listings.updateListingPrice');
}

export async function getListingsByLister(listerId: string): Promise<ListingRow[]> {
  const db = createServiceClient();
  const result = await db
    .from('listings')
    .select('*')
    .eq('lister_id', listerId)
    .order('created_at', { ascending: false });
  return unwrap(result, 'listings.getListingsByLister');
}
