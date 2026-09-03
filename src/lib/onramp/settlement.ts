import 'server-only';

import type { Json } from '@/types/database';
import { type OnrampSessionRow, updateOnrampSession } from '@/lib/db/onramp';
import { type OrderRow, transitionOrder } from '@/lib/db/orders';
import { recordTransaction } from '@/lib/db/transactions';
import { writeAudit } from '@/lib/db/audit';
import type { OnrampSessionStatus } from '@/lib/onramp/types';

export interface ApplyOnrampStatusOptions {
  /** Receiving wallet, when the caller knows it (session poll or webhook). */
  wallet?: string;
  /** On-chain delivery tx hash reported by the provider, when available. */
  txHash?: string;
  /** Raw provider payload to persist on the session row. */
  raw?: Json;
}

export interface ApplyOnrampStatusResult {
  session: OnrampSessionRow;
  /** Latest order row when this call transitioned it, otherwise null. */
  order: OrderRow | null;
}

/**
 * Applies a provider-reported status to the session row and its linked
 * order. Shared by the status poll route and the webhook route so both paths
 * settle identically, and safe to call concurrently:
 *
 *   completed: order moves created|awaiting_funds to funded and an onramp
 *   transactions row is recorded. transitionOrder is a guarded single-row
 *   update, so exactly one of two racing callers wins the transition and
 *   only the winner writes the ledger row (idempotency).
 *
 *   failed or canceled: order moves created|awaiting_funds to failed with a
 *   failure_reason. An order that already reached funded or beyond is never
 *   touched (the money arrived; a late failure event must not undo it).
 */
export async function applyOnrampStatus(
  session: OnrampSessionRow,
  status: OnrampSessionStatus,
  options: ApplyOnrampStatusOptions = {},
): Promise<ApplyOnrampStatusResult> {
  let current = session;

  if (session.provider_session_id && (status !== session.status || options.raw !== undefined)) {
    const updated = await updateOnrampSession(session.provider_session_id, {
      status,
      ...(options.raw !== undefined ? { rawPayload: options.raw } : {}),
    });
    if (updated) {
      current = updated;
    }
  }

  if (!current.order_id) {
    return { session: current, order: null };
  }

  if (status === 'completed') {
    const order = await transitionOrder(current.order_id, ['created', 'awaiting_funds'], 'funded');
    if (order) {
      await recordTransaction({
        type: 'onramp',
        assetId: order.asset_id,
        orderId: order.id,
        toUserId: current.user_id,
        toWallet: options.wallet ?? null,
        total: current.token_amount,
        txHash: options.txHash ?? null,
      });
      await writeAudit({
        actorUserId: null,
        action: 'onramp.completed',
        entity: 'onramp_sessions',
        entityId: current.id,
        diff: { orderId: order.id, provider: current.provider, status },
      });
    }
    return { session: current, order };
  }

  if (status === 'failed' || status === 'canceled') {
    const order = await transitionOrder(
      current.order_id,
      ['created', 'awaiting_funds'],
      'failed',
      { failure_reason: status === 'failed' ? 'onramp_failed' : 'onramp_canceled' },
    );
    if (order) {
      await writeAudit({
        actorUserId: null,
        action: `onramp.${status}`,
        entity: 'onramp_sessions',
        entityId: current.id,
        diff: { orderId: order.id, provider: current.provider, status },
      });
    }
    return { session: current, order };
  }

  return { session: current, order: null };
}
