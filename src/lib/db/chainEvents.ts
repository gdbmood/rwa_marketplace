import 'server-only';

import type { Json } from '@/types/database';
import { createServiceClient } from '@/lib/supabase/server';
import { type Row, unwrap, unwrapMaybe } from '@/lib/db/helpers';

export type ChainEventRow = Row<'chain_events'>;

export interface InsertChainEventInput {
  chainId: number;
  contractAddress?: string | null;
  eventName: string;
  txHash: string;
  blockNumber: number;
  logIndex: number;
  args?: Json | null;
}

export interface InsertChainEventResult {
  /** False when the event was already recorded (idempotent replay). */
  inserted: boolean;
  event: ChainEventRow | null;
}

/** Idempotent on (chain_id, tx_hash, log_index): duplicates are ignored. */
export async function insertChainEvent(
  input: InsertChainEventInput,
): Promise<InsertChainEventResult> {
  const db = createServiceClient();
  const result = await db
    .from('chain_events')
    .upsert(
      {
        chain_id: input.chainId,
        contract_address: input.contractAddress
          ? input.contractAddress.toLowerCase()
          : null,
        event_name: input.eventName,
        tx_hash: input.txHash,
        block_number: input.blockNumber,
        log_index: input.logIndex,
        args: input.args ?? null,
      },
      { onConflict: 'chain_id,tx_hash,log_index', ignoreDuplicates: true },
    )
    .select('*')
    .maybeSingle();
  const event = unwrapMaybe(result, 'chainEvents.insertChainEvent');
  return { inserted: event !== null, event };
}

export async function listUnprocessedEvents(limit: number): Promise<ChainEventRow[]> {
  const db = createServiceClient();
  const result = await db
    .from('chain_events')
    .select('*')
    .eq('processed', false)
    .order('block_number', { ascending: true })
    .order('log_index', { ascending: true })
    .limit(limit);
  return unwrap(result, 'chainEvents.listUnprocessedEvents');
}

export async function markEventProcessed(id: string): Promise<ChainEventRow> {
  const db = createServiceClient();
  const result = await db
    .from('chain_events')
    .update({ processed: true, processed_at: new Date().toISOString(), error: null })
    .eq('id', id)
    .select('*')
    .single();
  return unwrap(result, 'chainEvents.markEventProcessed');
}

export async function markEventFailed(id: string, error: string): Promise<ChainEventRow> {
  const db = createServiceClient();
  const result = await db
    .from('chain_events')
    .update({ error })
    .eq('id', id)
    .select('*')
    .single();
  return unwrap(result, 'chainEvents.markEventFailed');
}
