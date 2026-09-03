import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * Ingestion cursor persistence for the indexer, backed by the
 * indexer_cursors table (supabase/migrations/20260903000008_indexer_cursor.sql).
 *
 * The table is not yet part of the generated src/types/database.ts (the
 * migration ships as a file and is applied at integration), so this module
 * uses an untyped client for these two queries only. Once the types are
 * regenerated this cast can be dropped.
 */

function untypedDb(): SupabaseClient {
  return createServiceClient() as unknown as SupabaseClient;
}

interface CursorRow {
  chain_id: number;
  contract_address: string;
  last_block: number;
}

/** Last ingested block for (chainId, contractAddress), or null when unset. */
export async function getCursor(
  chainId: number,
  contractAddress: string,
): Promise<number | null> {
  const result = await untypedDb()
    .from('indexer_cursors')
    .select('chain_id, contract_address, last_block')
    .eq('chain_id', chainId)
    .eq('contract_address', contractAddress.toLowerCase())
    .maybeSingle<CursorRow>();
  if (result.error) {
    throw new Error(`indexer.getCursor: ${result.error.message}`);
  }
  return result.data ? Number(result.data.last_block) : null;
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
  const result = await untypedDb()
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
