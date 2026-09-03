import 'server-only';

import { createServiceClient } from '@/lib/supabase/server';
import {
  type Row,
  type ViewRow,
  isUniqueViolation,
  unwrap,
  unwrapMaybe,
} from '@/lib/db/helpers';
import { type NumericInput, numericColumn, parseNumeric } from '@/lib/db/numeric';

export type HoldingRow = Row<'holdings'>;
export type PortfolioRow = ViewRow<'v_portfolio'>;

export interface HoldingDeltaInput {
  userId: string;
  assetId: string;
  /** Positive to add fractions, negative to remove them. */
  deltaQuantity: number;
  /** Price per fraction for average entry recomputation on positive deltas. */
  priceForAvg?: NumericInput;
  lastSyncedBlock?: number;
}

export async function getHolding(userId: string, assetId: string): Promise<HoldingRow | null> {
  const db = createServiceClient();
  const result = await db
    .from('holdings')
    .select('*')
    .eq('user_id', userId)
    .eq('asset_id', assetId)
    .maybeSingle();
  return unwrapMaybe(result, 'holdings.getHolding');
}

export async function getHoldingsForUser(userId: string): Promise<PortfolioRow[]> {
  const db = createServiceClient();
  const result = await db.from('v_portfolio').select('*').eq('user_id', userId);
  return unwrap(result, 'holdings.getHoldingsForUser');
}

/**
 * Upserts a holding by (userId, assetId), applying deltaQuantity with a
 * compare-and-swap so quantity never goes negative or below locked_quantity.
 * Positive deltas with priceForAvg recompute the weighted average entry
 * price. Returns null when the delta would violate an invariant or a
 * concurrent write won the race (caller may retry).
 */
export async function applyHoldingDelta({
  userId,
  assetId,
  deltaQuantity,
  priceForAvg,
  lastSyncedBlock,
}: HoldingDeltaInput): Promise<HoldingRow | null> {
  if (!Number.isInteger(deltaQuantity) || deltaQuantity === 0) {
    throw new Error(`holdings.applyHoldingDelta: invalid delta ${deltaQuantity}`);
  }
  const db = createServiceClient();
  const existing = await getHolding(userId, assetId);

  if (!existing) {
    if (deltaQuantity < 0) {
      return null;
    }
    try {
      const inserted = await db
        .from('holdings')
        .insert({
          user_id: userId,
          asset_id: assetId,
          quantity: deltaQuantity,
          locked_quantity: 0,
          average_entry_price:
            priceForAvg !== undefined ? numericColumn(priceForAvg) : null,
          last_synced_block: lastSyncedBlock ?? null,
        })
        .select('*')
        .single();
      return unwrap(inserted, 'holdings.applyHoldingDelta');
    } catch (error) {
      // Concurrent insert for the same (user, asset): signal the caller to retry.
      if (isUniqueViolation(error)) {
        return null;
      }
      throw error;
    }
  }

  const newQuantity = existing.quantity + deltaQuantity;
  if (newQuantity < 0 || newQuantity < existing.locked_quantity) {
    return null;
  }

  let averageEntryPrice = existing.average_entry_price;
  if (deltaQuantity > 0 && priceForAvg !== undefined) {
    const price = parseNumeric(priceForAvg) ?? 0;
    const currentAvg = parseNumeric(existing.average_entry_price);
    averageEntryPrice =
      currentAvg === null
        ? numericColumn(price)
        : numericColumn(
            (currentAvg * existing.quantity + price * deltaQuantity) / newQuantity,
          );
  }

  const result = await db
    .from('holdings')
    .update({
      quantity: newQuantity,
      average_entry_price: averageEntryPrice,
      ...(lastSyncedBlock !== undefined ? { last_synced_block: lastSyncedBlock } : {}),
    })
    .eq('id', existing.id)
    .eq('quantity', existing.quantity)
    .select('*')
    .maybeSingle();
  return unwrapMaybe(result, 'holdings.applyHoldingDelta');
}

/**
 * Locks fractions for an open listing. Guarded so locked_quantity never
 * exceeds quantity. Returns null when not enough unlocked fractions exist.
 */
export async function lockHoldingQuantity(
  userId: string,
  assetId: string,
  quantity: number,
): Promise<HoldingRow | null> {
  return adjustLockedQuantity(userId, assetId, quantity, 'holdings.lockHoldingQuantity');
}

/** Releases previously locked fractions. Returns null on underflow. */
export async function unlockHoldingQuantity(
  userId: string,
  assetId: string,
  quantity: number,
): Promise<HoldingRow | null> {
  return adjustLockedQuantity(userId, assetId, -quantity, 'holdings.unlockHoldingQuantity');
}

async function adjustLockedQuantity(
  userId: string,
  assetId: string,
  delta: number,
  context: string,
): Promise<HoldingRow | null> {
  if (!Number.isInteger(delta) || delta === 0) {
    throw new Error(`${context}: invalid quantity ${Math.abs(delta)}`);
  }
  const db = createServiceClient();
  const existing = await getHolding(userId, assetId);
  if (!existing) {
    return null;
  }

  const newLocked = existing.locked_quantity + delta;
  if (newLocked < 0 || newLocked > existing.quantity) {
    return null;
  }

  const result = await db
    .from('holdings')
    .update({ locked_quantity: newLocked })
    .eq('id', existing.id)
    .eq('locked_quantity', existing.locked_quantity)
    .eq('quantity', existing.quantity)
    .select('*')
    .maybeSingle();
  return unwrapMaybe(result, context);
}
