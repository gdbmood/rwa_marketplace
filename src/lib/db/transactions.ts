import 'server-only';

import { createServiceClient } from '@/lib/supabase/server';
import { type Enum, type Row, lowercaseWallet, unwrap, unwrapMaybe } from '@/lib/db/helpers';
import { type NumericInput, numericColumn } from '@/lib/db/numeric';

export type TransactionRow = Row<'transactions'>;
export type TxType = Enum<'tx_type'>;

export interface RecordTransactionInput {
  type: TxType;
  assetId?: string | null;
  orderId?: string | null;
  listingId?: string | null;
  fromUserId?: string | null;
  toUserId?: string | null;
  fromWallet?: string | null;
  toWallet?: string | null;
  quantity?: number | null;
  pricePerFraction?: NumericInput | null;
  total?: NumericInput | null;
  fee?: NumericInput | null;
  feeCurrency?: string | null;
  txHash?: string | null;
  blockNumber?: number | null;
  logIndex?: number | null;
}

/**
 * Records a ledger entry. When both txHash and logIndex are present the write
 * is idempotent on (tx_hash, log_index): replays return the existing row
 * unchanged instead of inserting a duplicate.
 */
export async function recordTransaction(input: RecordTransactionInput): Promise<TransactionRow> {
  const db = createServiceClient();
  const row = {
    type: input.type,
    asset_id: input.assetId ?? null,
    order_id: input.orderId ?? null,
    listing_id: input.listingId ?? null,
    from_user_id: input.fromUserId ?? null,
    to_user_id: input.toUserId ?? null,
    from_wallet: input.fromWallet ? lowercaseWallet(input.fromWallet) : null,
    to_wallet: input.toWallet ? lowercaseWallet(input.toWallet) : null,
    quantity: input.quantity ?? null,
    price_per_fraction:
      input.pricePerFraction != null ? numericColumn(input.pricePerFraction) : null,
    total: input.total != null ? numericColumn(input.total) : null,
    fee: input.fee != null ? numericColumn(input.fee) : null,
    fee_currency: input.feeCurrency ?? 'USDC',
    tx_hash: input.txHash ?? null,
    block_number: input.blockNumber ?? null,
    log_index: input.logIndex ?? null,
  };

  const idempotent = input.txHash != null && input.logIndex != null;
  if (!idempotent) {
    const inserted = await db.from('transactions').insert(row).select('*').single();
    return unwrap(inserted, 'transactions.recordTransaction');
  }

  const upserted = await db
    .from('transactions')
    .upsert(row, { onConflict: 'tx_hash,log_index', ignoreDuplicates: true })
    .select('*')
    .maybeSingle();
  const fresh = unwrapMaybe(upserted, 'transactions.recordTransaction');
  if (fresh) {
    return fresh;
  }

  // Duplicate: return the previously recorded row.
  const existing = await db
    .from('transactions')
    .select('*')
    .eq('tx_hash', input.txHash as string)
    .eq('log_index', input.logIndex as number)
    .single();
  return unwrap(existing, 'transactions.recordTransaction');
}

export async function listTransactionsForUser(userId: string): Promise<TransactionRow[]> {
  const db = createServiceClient();
  const result = await db
    .from('transactions')
    .select('*')
    .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
    .order('created_at', { ascending: false });
  return unwrap(result, 'transactions.listTransactionsForUser');
}

export async function listTransactionsForAsset(assetId: string): Promise<TransactionRow[]> {
  const db = createServiceClient();
  const result = await db
    .from('transactions')
    .select('*')
    .eq('asset_id', assetId)
    .order('created_at', { ascending: false });
  return unwrap(result, 'transactions.listTransactionsForAsset');
}
