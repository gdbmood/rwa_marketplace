import 'server-only';

import { createServiceClient } from '@/lib/supabase/server';
import { unwrap } from '@/lib/db/helpers';
import {
  insertChainEvent,
  listUnprocessedEvents,
  markEventFailed,
  markEventProcessed,
} from '@/lib/db/chainEvents';
import { getAssetByNftId } from '@/lib/db/assets';
import { updateListingPrice } from '@/lib/db/listings';
import { writeAudit } from '@/lib/db/audit';
import {
  type CoreChainEvent,
  type IndexerDeps,
  microToUsdc,
  processChainEvent,
  usdcToMicro,
} from '@/lib/indexer/core';
import {
  type ChainContextOverrides,
  type IndexerChainContext,
  balanceOfOnChain,
  createIndexerChainContext,
  fetchAllListingsOnChain,
  fetchMarketplaceLogs,
  fetchTransferLogs,
  getLatestBlock,
} from '@/lib/indexer/chain';
import { createIndexerDeps } from '@/lib/indexer/deps';
import { getCursor, setCursor } from '@/lib/indexer/cursor';

/**
 * One ingest cycle:
 *   1. fetch marketplace and fraction-token logs from the last processed
 *      block (persisted in indexer_cursors) up to a bounded range,
 *   2. write them into chain_events idempotently on (chain_id, tx_hash,
 *      log_index),
 *   3. process unprocessed events in block order via the core handlers,
 *   4. reconcile primary listings against fetchAllListings (the database
 *      follows the chain for primary listing price; quantity is clamped down
 *      to the issuer's on-chain balance because the resale book has no getter,
 *      see docs/audit/contracts.md sections 3 and 4).
 *
 * Every step is safe to replay, so overlapping cron runs or a webhook racing
 * the poller cannot double-apply anything.
 */

const DEFAULT_MAX_BLOCKS = 2000;
const DEFAULT_MAX_EVENTS = 200;

export interface IngestCycleOptions extends ChainContextOverrides {
  /** Upper bound of blocks fetched per cycle. */
  maxBlocks?: number;
  /** Upper bound of events processed per cycle. */
  maxEvents?: number;
  /** Skip the fetchAllListings reconciliation pass (used by tests/scripts). */
  skipReconcile?: boolean;
}

export interface ReconcileCounts {
  priceUpdates: number;
  quantityClamps: number;
  warnings: number;
}

export interface IngestCycleResult {
  chainId: number;
  fromBlock: number | null;
  toBlock: number | null;
  latestBlock: number;
  fetched: number;
  inserted: number;
  processed: number;
  skipped: number;
  retried: number;
  failed: number;
  reconcile: ReconcileCounts;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

interface KnownToken {
  token: string;
  assetId: string;
}

async function listKnownFractionTokens(chainId: number): Promise<KnownToken[]> {
  const db = createServiceClient();
  const result = await db
    .from('assets')
    .select('id, erc20_token_address')
    .eq('chain_id', chainId)
    .not('erc20_token_address', 'is', null);
  const rows = unwrap(result, 'ingest.listKnownFractionTokens');
  return rows
    .filter((row) => row.erc20_token_address !== null)
    .map((row) => ({ token: (row.erc20_token_address as string).toLowerCase(), assetId: row.id }));
}

export interface ProcessCounts {
  processed: number;
  skipped: number;
  retried: number;
  failed: number;
}

/**
 * Processes unprocessed chain_events rows for this chain in block order.
 * Shared by the polling cycle and the webhook route.
 */
export async function processPendingEvents(
  deps: IndexerDeps,
  chainId: number,
  limit: number = DEFAULT_MAX_EVENTS,
): Promise<ProcessCounts> {
  const counts: ProcessCounts = { processed: 0, skipped: 0, retried: 0, failed: 0 };
  const rows = await listUnprocessedEvents(limit);

  for (const row of rows) {
    if (row.chain_id !== chainId) {
      continue;
    }
    const event: CoreChainEvent = {
      chainId: row.chain_id,
      contractAddress: row.contract_address,
      eventName: row.event_name,
      txHash: row.tx_hash,
      blockNumber: row.block_number,
      logIndex: row.log_index,
      args: row.args,
    };
    try {
      const result = await processChainEvent(event, deps);
      if (result.outcome === 'retry') {
        counts.retried += 1;
        await markEventFailed(row.id, result.detail);
      } else {
        counts[result.outcome] += 1;
        await markEventProcessed(row.id);
      }
    } catch (error) {
      counts.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      await markEventFailed(row.id, message);
    }
  }

  return counts;
}

/**
 * Reconciles primary listings against fetchAllListings. Price follows the
 * chain (updateListing rewrites nfts[nftId].pricePerFraction with no event).
 * Quantity has no on-chain getter, so the only safe correction is clamping
 * the database quantity down to the issuer's live token balance; a database
 * quantity below the balance is reported to audit_log instead of raised.
 */
async function reconcilePrimaryListings(
  ctx: IndexerChainContext,
  deps: IndexerDeps,
): Promise<ReconcileCounts> {
  const counts: ReconcileCounts = { priceUpdates: 0, quantityClamps: 0, warnings: 0 };

  let chainListings;
  try {
    chainListings = await fetchAllListingsOnChain(ctx);
  } catch (error) {
    counts.warnings += 1;
    await writeAudit({
      actorUserId: null,
      action: 'indexer.reconcile_fetch_failed',
      diff: { message: error instanceof Error ? error.message : String(error) },
    });
    return counts;
  }

  for (const chainListing of chainListings) {
    if (!chainListing.isFractionalized) {
      continue;
    }
    const asset = await getAssetByNftId(chainListing.nftId);
    if (!asset || asset.chain_id !== ctx.chainId) {
      continue; // mint event not processed yet; the event path will catch up
    }
    const listings = await deps.getActiveListingsForAsset(asset.id);
    const primary = listings.find((l) => l.kind === 'primary' && l.listerId === asset.business_id);
    if (!primary) {
      continue; // fully filled or not yet created; nothing to reconcile
    }

    const chainPriceMicro = chainListing.pricePerFractionMicro;
    if (usdcToMicro(primary.pricePerFraction) !== chainPriceMicro) {
      const updated = await updateListingPrice(
        primary.id,
        primary.listerId,
        microToUsdc(chainPriceMicro),
      );
      if (updated) {
        counts.priceUpdates += 1;
      } else {
        counts.warnings += 1;
      }
    }

    try {
      const businessWallet = await walletOfBusiness(asset.business_id);
      if (!businessWallet) {
        continue;
      }
      const balance = await balanceOfOnChain(ctx, chainListing.erc20TokenAddress, businessWallet);
      const balanceQty = balance > BigInt(Number.MAX_SAFE_INTEGER)
        ? Number.MAX_SAFE_INTEGER
        : Number(balance);
      if (primary.quantity > balanceQty) {
        const clampBy = primary.quantity - balanceQty;
        const clamped = await deps.decrementListingQuantity(primary.id, clampBy);
        if (clamped) {
          counts.quantityClamps += 1;
          await writeAudit({
            actorUserId: null,
            action: 'indexer.primary_quantity_clamped',
            entity: 'listings',
            entityId: primary.id,
            diff: { assetId: asset.id, before: primary.quantity, after: balanceQty },
          });
        } else {
          counts.warnings += 1;
        }
      } else if (primary.quantity < balanceQty) {
        // Cannot be raised through the repositories; report only. The issuer
        // may simply hold unlisted fractions bought back on the market.
        counts.warnings += 1;
        await writeAudit({
          actorUserId: null,
          action: 'indexer.primary_quantity_below_balance',
          entity: 'listings',
          entityId: primary.id,
          diff: { assetId: asset.id, listed: primary.quantity, balance: balanceQty },
        });
      }
    } catch (error) {
      counts.warnings += 1;
      await writeAudit({
        actorUserId: null,
        action: 'indexer.reconcile_balance_failed',
        entity: 'assets',
        entityId: asset.id,
        diff: { message: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  return counts;
}

async function walletOfBusiness(businessId: string): Promise<string | null> {
  const db = createServiceClient();
  const result = await db
    .from('users')
    .select('wallet_address')
    .eq('id', businessId)
    .maybeSingle();
  if (result.error) {
    throw new Error(`ingest.walletOfBusiness: ${result.error.message}`);
  }
  return result.data ? result.data.wallet_address : null;
}

/** Runs one bounded ingest cycle. Safe to run concurrently with itself. */
export async function runIngestCycle(
  options: IngestCycleOptions = {},
): Promise<IngestCycleResult> {
  const ctx = createIndexerChainContext(options);
  const deps = createIndexerDeps(ctx);
  const maxBlocks = options.maxBlocks ?? envInt('INDEXER_MAX_BLOCKS', DEFAULT_MAX_BLOCKS);
  const maxEvents = options.maxEvents ?? envInt('INDEXER_MAX_EVENTS', DEFAULT_MAX_EVENTS);
  const confirmations = envInt('INDEXER_CONFIRMATIONS', 0);
  const startBlock = envInt('INDEXER_START_BLOCK', 0);

  const latestBlock = await getLatestBlock(ctx);
  const cursor = await getCursor(ctx.chainId, ctx.marketplaceAddress);
  const fromBlock = (cursor ?? startBlock - 1) + 1;
  const toBlock = Math.min(latestBlock - confirmations, fromBlock + maxBlocks - 1);

  let fetched = 0;
  let inserted = 0;
  let rangeFetched = false;

  if (toBlock >= fromBlock) {
    const marketplaceLogs = await fetchMarketplaceLogs(ctx, fromBlock, toBlock);
    const tokens = await listKnownFractionTokens(ctx.chainId);
    const transferLogs = await fetchTransferLogs(
      ctx,
      tokens.map((t) => t.token),
      fromBlock,
      toBlock,
    );
    const allLogs = [...marketplaceLogs, ...transferLogs];
    fetched = allLogs.length;
    for (const log of allLogs) {
      const result = await insertChainEvent({
        chainId: log.chainId,
        contractAddress: log.contractAddress,
        eventName: log.eventName,
        txHash: log.txHash,
        blockNumber: log.blockNumber,
        logIndex: log.logIndex,
        args: log.args,
      });
      if (result.inserted) {
        inserted += 1;
      }
    }
    rangeFetched = true;
  }

  const processCounts = await processPendingEvents(deps, ctx.chainId, maxEvents);

  // Advance the cursor only after the fetched range landed in chain_events;
  // processing failures are retried from the table, not by re-fetching.
  if (rangeFetched) {
    await setCursor(ctx.chainId, ctx.marketplaceAddress, toBlock);
  }

  const reconcile = options.skipReconcile
    ? { priceUpdates: 0, quantityClamps: 0, warnings: 0 }
    : await reconcilePrimaryListings(ctx, deps);

  return {
    chainId: ctx.chainId,
    fromBlock: rangeFetched ? fromBlock : null,
    toBlock: rangeFetched ? toBlock : null,
    latestBlock,
    fetched,
    inserted,
    processed: processCounts.processed,
    skipped: processCounts.skipped,
    retried: processCounts.retried,
    failed: processCounts.failed,
    reconcile,
  };
}
