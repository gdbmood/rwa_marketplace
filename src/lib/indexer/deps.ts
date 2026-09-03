import 'server-only';

import type { Json } from '@/types/database';
import { createServiceClient } from '@/lib/supabase/server';
import { unwrap, unwrapMaybe } from '@/lib/db/helpers';
import {
  type AssetRow,
  getAssetByErc20,
  promoteAssetToActive,
  setAssetStatus,
  updateAssetSupply,
} from '@/lib/db/assets';
import { getUserByWallet } from '@/lib/db/users';
import {
  type ListingRow,
  createListing,
  decrementListingQuantity,
  getActiveListingsForAsset,
} from '@/lib/db/listings';
import {
  type HoldingRow,
  applyHoldingDelta,
  getHolding,
  lockHoldingQuantity,
  unlockHoldingQuantity,
} from '@/lib/db/holdings';
import { type OrderRow, createOrder, transitionOrder } from '@/lib/db/orders';
import { recordTransaction } from '@/lib/db/transactions';
import { writeAudit } from '@/lib/db/audit';
import {
  type IndexerAsset,
  type IndexerDeps,
  type IndexerHolding,
  type IndexerListing,
  type IndexerOrder,
  type SettledFill,
  type TransferLogRecord,
} from '@/lib/indexer/core';
import {
  type IndexerChainContext,
  getTransferLogsFromReceipt,
  getTxSender,
} from '@/lib/indexer/chain';

/**
 * Real IndexerDeps implementation. All writes go through the src/lib/db
 * repositories (ownership and invariants enforced there); the direct service
 * client calls below are read-only lookups the repositories do not cover.
 * Money columns cross the wire as numeric strings even though the generated
 * types say number, so every money field is normalized through String().
 */

function numericToString(value: number | string | null): string | null {
  return value === null || value === undefined ? null : String(value);
}

async function walletForUser(userId: string): Promise<string | null> {
  const db = createServiceClient();
  const result = await db
    .from('users')
    .select('wallet_address')
    .eq('id', userId)
    .maybeSingle();
  const row = unwrapMaybe(result, 'indexerDeps.walletForUser');
  return row ? row.wallet_address : null;
}

async function toIndexerAsset(row: AssetRow): Promise<IndexerAsset> {
  return {
    id: row.id,
    nftId: row.nft_id,
    businessId: row.business_id,
    businessWallet: await walletForUser(row.business_id),
    status: row.status,
    erc20TokenAddress: row.erc20_token_address,
    totalSupply: row.total_supply,
    availableSupply: row.available_supply,
    mintPricePerFraction: numericToString(row.mint_price_per_fraction),
    chainId: row.chain_id,
    mintTxHash: row.mint_tx_hash,
  };
}

function toIndexerListing(row: ListingRow): IndexerListing {
  return {
    id: row.id,
    assetId: row.asset_id,
    listerId: row.lister_id,
    kind: row.kind,
    quantity: row.quantity,
    pricePerFraction: String(row.price_per_fraction),
    status: row.status,
  };
}

function toIndexerHolding(row: HoldingRow): IndexerHolding {
  return {
    id: row.id,
    userId: row.user_id,
    assetId: row.asset_id,
    quantity: row.quantity,
    lockedQuantity: row.locked_quantity,
  };
}

function toIndexerOrder(row: OrderRow): IndexerOrder {
  return {
    id: row.id,
    buyerId: row.buyer_id,
    assetId: row.asset_id,
    quantity: row.quantity,
    status: row.status,
    txHash: row.tx_hash,
    quotedTotal: String(row.quoted_total),
    platformFee: String(row.platform_fee),
  };
}

function fillsToJson(fills: SettledFill[]): Json {
  return fills.map((fill) => ({
    logIndex: fill.logIndex,
    sellerWallet: fill.sellerWallet,
    sellerUserId: fill.sellerUserId,
    quantity: fill.quantity,
    pricePerFraction: fill.pricePerFraction,
    total: fill.total,
    fee: fill.fee,
    listingId: fill.listingId,
    parts: fill.parts.map((part) => ({
      listingId: part.listingId,
      quantity: part.quantity,
      priceMicro: part.priceMicro.toString(),
    })),
  })) as Json;
}

const ORDER_SETTLE_FROM = ['created', 'awaiting_funds', 'funded', 'submitted'] as const;

export function createIndexerDeps(ctx: IndexerChainContext): IndexerDeps {
  return {
    async getAssetByErc20(token) {
      const row = await getAssetByErc20(token);
      return row ? toIndexerAsset(row) : null;
    },

    async getAssetByMintTxHash(txHash) {
      const db = createServiceClient();
      const result = await db
        .from('assets')
        .select('*')
        .eq('mint_tx_hash', txHash)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      const row = unwrapMaybe(result, 'indexerDeps.getAssetByMintTxHash');
      return row ? toIndexerAsset(row) : null;
    },

    async getOldestMintingAssetForWallet(wallet) {
      const user = await getUserByWallet(wallet);
      if (!user) {
        return null;
      }
      const db = createServiceClient();
      const result = await db
        .from('assets')
        .select('*')
        .eq('business_id', user.id)
        .eq('status', 'minting')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      const row = unwrapMaybe(result, 'indexerDeps.getOldestMintingAssetForWallet');
      return row ? toIndexerAsset(row) : null;
    },

    async promoteAssetToActive(assetId, input) {
      const row = await promoteAssetToActive(assetId, input);
      return row ? toIndexerAsset(row) : null;
    },

    async updateAssetSupply(assetId, availableSupply) {
      await updateAssetSupply(assetId, availableSupply);
    },

    async setAssetStatus(assetId, status) {
      await setAssetStatus(assetId, status);
    },

    async getUserByWallet(wallet) {
      const row = await getUserByWallet(wallet);
      return row ? { id: row.id, walletAddress: row.wallet_address } : null;
    },

    async getActiveListingsForAsset(assetId) {
      const rows = await getActiveListingsForAsset(assetId);
      return rows.map(toIndexerListing);
    },

    async createListing(input) {
      const row = await createListing({
        assetId: input.assetId,
        listerId: input.listerId,
        kind: input.kind,
        quantity: input.quantity,
        pricePerFraction: input.pricePerFraction,
        txHash: input.txHash,
      });
      return toIndexerListing(row);
    },

    async decrementListingQuantity(listingId, by) {
      const row = await decrementListingQuantity(listingId, by);
      return row ? toIndexerListing(row) : null;
    },

    async getHolding(userId, assetId) {
      const row = await getHolding(userId, assetId);
      return row ? toIndexerHolding(row) : null;
    },

    async applyHoldingDelta(input) {
      const row = await applyHoldingDelta({
        userId: input.userId,
        assetId: input.assetId,
        deltaQuantity: input.deltaQuantity,
        ...(input.priceForAvg !== undefined ? { priceForAvg: input.priceForAvg } : {}),
      });
      return row ? toIndexerHolding(row) : null;
    },

    async lockHoldingQuantity(userId, assetId, quantity) {
      const row = await lockHoldingQuantity(userId, assetId, quantity);
      return row ? toIndexerHolding(row) : null;
    },

    async unlockHoldingQuantity(userId, assetId, quantity) {
      const row = await unlockHoldingQuantity(userId, assetId, quantity);
      return row ? toIndexerHolding(row) : null;
    },

    async getOrderByTxHash(txHash) {
      const db = createServiceClient();
      const result = await db
        .from('orders')
        .select('*')
        .eq('tx_hash', txHash)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const row = unwrapMaybe(result, 'indexerDeps.getOrderByTxHash');
      return row ? toIndexerOrder(row) : null;
    },

    async settleOrder(orderId, patch) {
      const row = await transitionOrder(orderId, [...ORDER_SETTLE_FROM], 'settled', {
        tx_hash: patch.txHash,
        fills: fillsToJson(patch.fills),
      });
      return row ? toIndexerOrder(row) : null;
    },

    async createChainDirectOrder(input) {
      const created = await createOrder({
        buyerId: input.buyerId,
        assetId: input.assetId,
        quantity: input.quantity,
        quotedTotal: input.quotedTotal,
        platformFee: input.platformFee,
        paymentMethod: 'chain_direct',
        fills: fillsToJson(input.fills),
      });
      // Submitted, not settled: the handler settles it only after every fill's
      // transactions row is written, keeping replays able to finish the work.
      const submitted = await transitionOrder(created.id, ['created'], 'submitted', {
        tx_hash: input.txHash,
      });
      return submitted ? toIndexerOrder(submitted) : toIndexerOrder(created);
    },

    async recordTransaction(input) {
      await recordTransaction({
        type: input.type,
        assetId: input.assetId ?? null,
        orderId: input.orderId ?? null,
        listingId: input.listingId ?? null,
        fromUserId: input.fromUserId ?? null,
        toUserId: input.toUserId ?? null,
        fromWallet: input.fromWallet ?? null,
        toWallet: input.toWallet ?? null,
        quantity: input.quantity ?? null,
        pricePerFraction: input.pricePerFraction ?? null,
        total: input.total ?? null,
        fee: input.fee ?? null,
        txHash: input.txHash,
        blockNumber: input.blockNumber,
        logIndex: input.logIndex,
      });
    },

    async transactionExists(txHash, logIndex) {
      const db = createServiceClient();
      const result = await db
        .from('transactions')
        .select('id')
        .eq('tx_hash', txHash)
        .eq('log_index', logIndex)
        .limit(1);
      const rows = unwrap(result, 'indexerDeps.transactionExists');
      return rows.length > 0;
    },

    async writeAudit(input) {
      await writeAudit({
        actorUserId: null,
        action: input.action,
        entity: input.entity ?? null,
        entityId: input.entityId ?? null,
        diff: (input.diff ?? null) as Json,
      });
    },

    async getTransferLogsForTx(chainId, txHash, token) {
      const db = createServiceClient();
      const result = await db
        .from('chain_events')
        .select('*')
        .eq('chain_id', chainId)
        .eq('tx_hash', txHash)
        .eq('event_name', 'Transfer')
        .eq('contract_address', token.toLowerCase())
        .order('log_index', { ascending: true });
      const rows = unwrap(result, 'indexerDeps.getTransferLogsForTx');

      const records: TransferLogRecord[] = [];
      for (const row of rows) {
        const args = row.args as Record<string, unknown> | null;
        const from = typeof args?.from === 'string' ? args.from.toLowerCase() : null;
        const to = typeof args?.to === 'string' ? args.to.toLowerCase() : null;
        const value = typeof args?.value === 'string' && /^\d+$/.test(args.value) ? BigInt(args.value) : null;
        if (from && to && value !== null) {
          records.push({ from, to, value, logIndex: row.log_index });
        }
      }
      if (records.length > 0) {
        return records;
      }
      // Webhook-only ingestion may deliver FractionBought without the token's
      // Transfer logs; fall back to the transaction receipt.
      return getTransferLogsFromReceipt(ctx, txHash, token);
    },

    async hasFractionBoughtInTx(chainId, txHash) {
      const db = createServiceClient();
      const result = await db
        .from('chain_events')
        .select('id')
        .eq('chain_id', chainId)
        .eq('tx_hash', txHash)
        .eq('event_name', 'FractionBought')
        .limit(1);
      const rows = unwrap(result, 'indexerDeps.hasFractionBoughtInTx');
      return rows.length > 0;
    },

    async getTxSender(txHash) {
      return getTxSender(ctx, txHash);
    },
  };
}
