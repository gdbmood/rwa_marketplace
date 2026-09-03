import 'server-only';

import { createServiceClient } from '@/lib/supabase/server';

/**
 * Ingestion cursor persistence for the indexer, backed by the
 * indexer_cursors table (supabase/migrations/20260903000008_indexer_cursor.sql).
 */

/** Last ingested block for (chainId, contractAddress), or null when unset. */
export async function getCursor(
  chainId: number,
  contractAddress: string,
): Promise<number | null> {
  const result = await createServiceClient()
    .from('indexer_cursors')
    .select('chain_id, contract_address, last_block')
    .eq('chain_id', chainId)
    .eq('contract_address', contractAddress.toLowerCase())
    .maybeSingle();
  if (result.error) {
    throw new Error(`indexer.getCursor: ${result.error.message}`);
  }
  return result.data ? Number(result.data.last_block) : null;
}

/**
 * Moves the cursor backwards explicitly. Only for chain-reset recovery: when
 * the chain's tip is behind the stored cursor (a fresh local node, or an RPC
 * serving a shorter history) ingestion would otherwise freeze forever,
 * because setCursor never rewinds and the fetch range stays empty.
 */
export async function rewindCursor(
  chainId: number,
  contractAddress: string,
  lastBlock: number,
): Promise<void> {
  const result = await createServiceClient()
    .from('indexer_cursors')
    .upsert(
      {
        chain_id: chainId,
        contract_address: contractAddress.toLowerCase(),
        last_block: lastBlock,
      },
      { onConflict: 'chain_id,contract_address' },
    );
  if (result.error) {
    throw new Error(`indexer.rewindCursor: ${result.error.message}`);
  }
}

/** Advances the cursor. Never moves it backwards (replays are idempotent anyway). */
export async function setCursor(
  chainId: number,
  contractAddress: string,
  lastBlock: number,
): Promise<void> {
  const current = await getCursor(chainId, contractAddress);
  if (current !== null && current >= lastBlock) {
    return;
  }
  const result = await createServiceClient()
    .from('indexer_cursors')
    .upsert(
      {
        chain_id: chainId,
        contract_address: contractAddress.toLowerCase(),
        last_block: lastBlock,
      },
      { onConflict: 'chain_id,contract_address' },
    );
  if (result.error) {
    throw new Error(`indexer.setCursor: ${result.error.message}`);
  }
}
