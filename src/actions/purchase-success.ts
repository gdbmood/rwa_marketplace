'use server';

import type { ActionResult } from '@/actions/result';

/**
 * REMOVED. The old purchaseSuccessOnBlockchain mutated listings, holdings and
 * supply with admin rights, unauthenticated and without any on-chain
 * verification (docs/audit/backend.md F-PUR-1). Settlement is now owned by
 * the chain indexer (WS2): it observes FractionBought and the ERC20 Transfer
 * logs, decrements listings, updates holdings and settles the order.
 *
 * This stub exists so stale imports fail loudly at review instead of
 * silently writing nothing. Do not call it; delete the caller instead.
 * Known caller to remove: src/utils/purchaseSuccess.ts (WS4 ownership).
 */
export async function purchaseSuccessOnBlockchain(
  _assetId?: string,
  _quantity?: number,
): Promise<ActionResult<never>> {
  return {
    ok: false,
    error: { code: 'gone', message: 'settlement is handled by the chain indexer' },
  };
}
