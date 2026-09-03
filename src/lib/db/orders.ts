import 'server-only';

import type { Json } from '@/types/database';
import { createServiceClient } from '@/lib/supabase/server';
import { type Enum, type Row, type UpdateRow, unwrap, unwrapMaybe } from '@/lib/db/helpers';
import { type NumericInput, numericColumn } from '@/lib/db/numeric';

export type OrderRow = Row<'orders'>;
export type OrderStatus = Enum<'order_status'>;

export interface CreateOrderInput {
  buyerId: string;
  assetId: string;
  quantity: number;
  quotedTotal: NumericInput;
  platformFee: NumericInput;
  paymentMethod?: string | null;
  fills?: Json | null;
  expiresAt?: string | null;
}

export type OrderTransitionPatch = Partial<
  Pick<UpdateRow<'orders'>, 'tx_hash' | 'failure_reason' | 'fills' | 'payment_method' | 'expires_at'>
>;

const FAILABLE_STATUSES: OrderStatus[] = ['created', 'awaiting_funds', 'funded', 'submitted'];

export async function createOrder(input: CreateOrderInput): Promise<OrderRow> {
  const db = createServiceClient();
  const result = await db
    .from('orders')
    .insert({
      buyer_id: input.buyerId,
      asset_id: input.assetId,
      quantity: input.quantity,
      quoted_total: numericColumn(input.quotedTotal),
      platform_fee: numericColumn(input.platformFee),
      payment_method: input.paymentMethod ?? null,
      fills: input.fills ?? null,
      expires_at: input.expiresAt ?? null,
      status: 'created',
    })
    .select('*')
    .single();
  return unwrap(result, 'orders.createOrder');
}

/**
 * Guarded state transition: only applies when the current status is one of
 * `from`. Returns the updated row, or null when the order is not in an
 * expected state (already transitioned by a concurrent writer).
 */
export async function transitionOrder(
  orderId: string,
  from: OrderStatus[],
  to: OrderStatus,
  patch?: OrderTransitionPatch,
): Promise<OrderRow | null> {
  if (from.length === 0) {
    throw new Error('orders.transitionOrder: from states must not be empty');
  }
  const db = createServiceClient();
  const result = await db
    .from('orders')
    .update({ status: to, ...patch })
    .eq('id', orderId)
    .in('status', from)
    .select('*')
    .maybeSingle();
  return unwrapMaybe(result, 'orders.transitionOrder');
}

export async function getOrderById(orderId: string): Promise<OrderRow | null> {
  const db = createServiceClient();
  const result = await db.from('orders').select('*').eq('id', orderId).maybeSingle();
  return unwrapMaybe(result, 'orders.getOrderById');
}

export async function getOrdersForUser(buyerId: string): Promise<OrderRow[]> {
  const db = createServiceClient();
  const result = await db
    .from('orders')
    .select('*')
    .eq('buyer_id', buyerId)
    .order('created_at', { ascending: false });
  return unwrap(result, 'orders.getOrdersForUser');
}

/** Fails an order from any non-terminal state, recording the reason. */
export async function failOrder(orderId: string, reason: string): Promise<OrderRow | null> {
  return transitionOrder(orderId, FAILABLE_STATUSES, 'failed', { failure_reason: reason });
}
