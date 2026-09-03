import 'server-only';

import { createServiceClient } from '@/lib/supabase/server';
import { unwrap } from '@/lib/db/helpers';
import { transitionOrder } from '@/lib/db/orders';

/**
 * Order expiry sweep (cron, every 10 minutes):
 *   - orders in created, awaiting_funds or funded past their expires_at are
 *     moved to expired,
 *   - submitted orders older than 2 hours are failed (the transaction never
 *     confirmed and the indexer never saw a FractionBought for it; if the tx
 *     does land later the settlement path still records the fills and the
 *     failure shows up in reconciliation).
 *
 * Reads are direct service-client selects (repositories expose no stale-order
 * listing); every state change goes through the guarded transitionOrder
 * repository call, so a race with the indexer settling the same order is lost
 * cleanly (the transition simply does not apply).
 */

const SUBMITTED_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const SWEEP_BATCH = 200;

export interface SweepResult {
  expired: number;
  failedSubmitted: number;
}

export async function runOrderSweep(now: Date = new Date()): Promise<SweepResult> {
  const db = createServiceClient();
  const nowIso = now.toISOString();
  const result: SweepResult = { expired: 0, failedSubmitted: 0 };

  const staleOpen = await db
    .from('orders')
    .select('id, status')
    .in('status', ['created', 'awaiting_funds', 'funded'])
    .not('expires_at', 'is', null)
    .lt('expires_at', nowIso)
    .limit(SWEEP_BATCH);
  for (const order of unwrap(staleOpen, 'sweep.staleOpen')) {
    const transitioned = await transitionOrder(
      order.id,
      ['created', 'awaiting_funds', 'funded'],
      'expired',
      { failure_reason: 'Order expired before completion' },
    );
    if (transitioned) {
      result.expired += 1;
    }
  }

  const submittedCutoff = new Date(now.getTime() - SUBMITTED_MAX_AGE_MS).toISOString();
  const staleSubmitted = await db
    .from('orders')
    .select('id, created_at, updated_at')
    .eq('status', 'submitted')
    .lt('created_at', submittedCutoff)
    .limit(SWEEP_BATCH);
  for (const order of unwrap(staleSubmitted, 'sweep.staleSubmitted')) {
    // updated_at reflects the transition into submitted; respect it when the
    // order row itself is older than the submission.
    if (order.updated_at && order.updated_at >= submittedCutoff) {
      continue;
    }
    const transitioned = await transitionOrder(order.id, ['submitted'], 'failed', {
      failure_reason: 'Submitted transaction not confirmed within 2 hours',
    });
    if (transitioned) {
      result.failedSubmitted += 1;
    }
  }

  return result;
}
