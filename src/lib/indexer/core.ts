/**
 * Pure chain event processing.
 *
 * Every handler receives a normalized chain_events row plus an IndexerDeps
 * implementation (src/lib/indexer/deps.ts wires the real repositories) and
 * applies the plan rules:
 *
 *   NFTFractionalized  match the asset by mint_tx_hash (fallback: the oldest
 *                      minting asset owned by the transaction sender),
 *                      promote it to active, seed the business holding,
 *                      create the primary listing and record the mint
 *                      transaction.
 *   FractionBought     map erc20Token to the asset, derive per-seller fills
 *                      from the ERC20 Transfer logs of the same transaction
 *                      (the event itself does not identify sellers), decrement
 *                      listings cheapest first, move holdings, settle the
 *                      submitted order found by tx_hash (or record a settled
 *                      order when the buyer's browser closed before
 *                      submitOrderTx), write one transactions row per fill and
 *                      mark the asset sold_out at zero available supply.
 *   Transfer           plain ERC20 transfer on a known fraction token outside
 *                      a buy transaction: adjust both holdings and write a
 *                      transfer transaction. Transfers inside a buy tx are
 *                      skipped here because FractionBought settles them.
 *   RoyaltyDistributed recorded in audit_log only. No tx_type in the enum
 *                      fits a revenue distribution ('buy' and 'onramp' would
 *                      misrepresent it), so no transactions row is written.
 *                      Recorded recommendation: add a 'royalty' tx_type in a
 *                      future migration and backfill from audit_log.
 *
 * All handlers are idempotent and safe to replay: per-fill idempotency rides
 * on the transactions (tx_hash, log_index) unique key, listing decrements and
 * holding deltas are compare-and-swap guarded in the repositories, and no
 * client supplied row is ever trusted (every value is re-validated and
 * re-derived from chain data).
 *
 * Known limitation (documented, not fixable at this layer): the repositories
 * expose no cross-table transaction, so a crash in the middle of a fill can
 * leave that one fill partially applied until the next replay. A Postgres
 * function wrapping settlement in one transaction is the recorded follow-up.
 */

// Money: USDC has 6 decimals. On-chain values are bigint micro USDC, database
// numeric columns are decimal strings in whole USDC units.

const MICRO_PER_USDC = BigInt(1000000);
const MONEY_SCALE = 6;

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;
const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

/** Converts bigint micro USDC to a numeric string in whole USDC units. */
export function microToUsdc(value: bigint): string {
  const negative = value < BigInt(0);
  const abs = negative ? -value : value;
  const whole = abs / MICRO_PER_USDC;
  const frac = (abs % MICRO_PER_USDC).toString().padStart(MONEY_SCALE, '0');
  const trimmedFrac = frac.replace(/0+$/, '');
  const body = trimmedFrac.length > 0 ? `${whole}.${trimmedFrac}` : whole.toString();
  return negative ? `-${body}` : body;
}

/** Converts a numeric string (or number) in USDC units to bigint micro USDC. */
export function usdcToMicro(value: string | number): bigint {
  const raw = typeof value === 'number' ? value.toFixed(MONEY_SCALE) : value.trim();
  if (!DECIMAL_PATTERN.test(raw)) {
    throw new EventArgsError(`Invalid USDC amount: "${value}"`);
  }
  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole, frac = ''] = unsigned.split('.');
  const paddedFrac = frac.slice(0, MONEY_SCALE).padEnd(MONEY_SCALE, '0');
  const micro = BigInt(whole) * MICRO_PER_USDC + BigInt(paddedFrac);
  return negative ? -micro : micro;
}

export class EventArgsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EventArgsError';
  }
}

function argsRecord(args: unknown): Record<string, unknown> {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    throw new EventArgsError('Event args are not an object');
  }
  return args as Record<string, unknown>;
}

function argAddress(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string') {
    throw new EventArgsError(`Missing address arg "${key}"`);
  }
  const address = value.trim().toLowerCase();
  if (!ADDRESS_PATTERN.test(address)) {
    throw new EventArgsError(`Invalid address arg "${key}": "${value}"`);
  }
  return address;
}

function argBigInt(args: Record<string, unknown>, key: string): bigint {
  const value = args[key];
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return BigInt(value);
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    return BigInt(value.trim());
  }
  throw new EventArgsError(`Invalid integer arg "${key}": "${String(value)}"`);
}

function toSafeNumber(value: bigint, label: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(0)) {
    throw new EventArgsError(`${label} out of safe integer range: ${value}`);
  }
  return Number(value);
}

// Normalized record shapes provided by IndexerDeps. Money fields are numeric
// strings in USDC units, never floats, so settlement math stays exact.

export interface IndexerAsset {
  id: string;
  nftId: number | null;
  businessId: string;
  businessWallet: string | null;
  status: string;
  erc20TokenAddress: string | null;
  totalSupply: number | null;
  availableSupply: number | null;
  mintPricePerFraction: string | null;
  chainId: number;
  mintTxHash: string | null;
}

export interface IndexerUser {
  id: string;
  walletAddress: string;
}

export interface IndexerListing {
  id: string;
  assetId: string;
  listerId: string;
  kind: 'primary' | 'secondary';
  quantity: number;
  pricePerFraction: string;
  status: string;
}

export interface IndexerHolding {
  id: string;
  userId: string;
  assetId: string;
  quantity: number;
  lockedQuantity: number;
}

export interface IndexerOrder {
  id: string;
  buyerId: string;
  assetId: string;
  quantity: number;
  status: string;
  txHash: string | null;
  quotedTotal: string;
  platformFee: string;
}

export interface TransferLogRecord {
  from: string;
  to: string;
  value: bigint;
  logIndex: number;
}

export interface CoreChainEvent {
  chainId: number;
  contractAddress: string | null;
  eventName: string;
  txHash: string;
  blockNumber: number;
  logIndex: number;
  args: unknown;
}

/** One part of a fill: quantity taken from a specific database listing. */
export interface FillPart {
  listingId: string;
  quantity: number;
  priceMicro: bigint;
}

/** A settled fill, one per ERC20 Transfer log of the buy transaction. */
export interface SettledFill {
  logIndex: number;
  sellerWallet: string;
  sellerUserId: string | null;
  quantity: number;
  /** Weighted price in USDC units, null when no matching listing was found. */
  pricePerFraction: string | null;
  /** Exact total in USDC units, null when no matching listing was found. */
  total: string | null;
  fee: string | null;
  listingId: string | null;
  parts: FillPart[];
}

export interface ProcessOutcome {
  outcome: 'processed' | 'skipped' | 'retry';
  detail: string;
}

export interface IndexerDeps {
  getAssetByErc20(token: string): Promise<IndexerAsset | null>;
  getAssetByMintTxHash(txHash: string): Promise<IndexerAsset | null>;
  getOldestMintingAssetForWallet(wallet: string): Promise<IndexerAsset | null>;
  promoteAssetToActive(
    assetId: string,
    input: { nftId: number; erc20TokenAddress: string; totalSupply: number; mintTxHash: string },
  ): Promise<IndexerAsset | null>;
  updateAssetSupply(assetId: string, availableSupply: number): Promise<void>;
  setAssetStatus(assetId: string, status: 'active' | 'sold_out' | 'delisted'): Promise<void>;

  getUserByWallet(wallet: string): Promise<IndexerUser | null>;

  getActiveListingsForAsset(assetId: string): Promise<IndexerListing[]>;
  createListing(input: {
    assetId: string;
    listerId: string;
    kind: 'primary' | 'secondary';
    quantity: number;
    pricePerFraction: string;
    txHash: string;
  }): Promise<IndexerListing>;
  decrementListingQuantity(listingId: string, by: number): Promise<IndexerListing | null>;

  getHolding(userId: string, assetId: string): Promise<IndexerHolding | null>;
  applyHoldingDelta(input: {
    userId: string;
    assetId: string;
    deltaQuantity: number;
    priceForAvg?: string;
  }): Promise<IndexerHolding | null>;
  lockHoldingQuantity(userId: string, assetId: string, quantity: number): Promise<IndexerHolding | null>;
  unlockHoldingQuantity(userId: string, assetId: string, quantity: number): Promise<IndexerHolding | null>;

  getOrderByTxHash(txHash: string): Promise<IndexerOrder | null>;
  settleOrder(orderId: string, patch: { txHash: string; fills: SettledFill[] }): Promise<IndexerOrder | null>;
  createSettledOrder(input: {
    buyerId: string;
    assetId: string;
    quantity: number;
    quotedTotal: string;
    platformFee: string;
    txHash: string;
    fills: SettledFill[];
  }): Promise<IndexerOrder | null>;

  recordTransaction(input: {
    type: 'mint' | 'buy' | 'transfer';
    assetId?: string | null;
    orderId?: string | null;
    listingId?: string | null;
    fromUserId?: string | null;
    toUserId?: string | null;
    fromWallet?: string | null;
    toWallet?: string | null;
    quantity?: number | null;
    pricePerFraction?: string | null;
    total?: string | null;
    fee?: string | null;
    txHash: string;
    blockNumber: number;
    logIndex: number;
  }): Promise<void>;
  transactionExists(txHash: string, logIndex: number): Promise<boolean>;

  writeAudit(input: {
    action: string;
    entity?: string | null;
    entityId?: string | null;
    diff?: Record<string, unknown>;
  }): Promise<void>;

  getTransferLogsForTx(chainId: number, txHash: string, token: string): Promise<TransferLogRecord[]>;
  hasFractionBoughtInTx(chainId: number, txHash: string): Promise<boolean>;
  getTxSender(txHash: string): Promise<string | null>;
}

const CAS_RETRIES = 3;

/** Retries a compare-and-swap repository call that signals races with null. */
async function retryNull<T>(fn: () => Promise<T | null>): Promise<T | null> {
  for (let attempt = 0; attempt < CAS_RETRIES; attempt += 1) {
    const result = await fn();
    if (result !== null) {
      return result;
    }
  }
  return null;
}

function weightedPrice(totalMicro: bigint, quantity: number): string {
  if (quantity <= 0) {
    return microToUsdc(BigInt(0));
  }
  // Integer division in micro USDC; sub-micro dust stays in the exact total.
  return microToUsdc(totalMicro / BigInt(quantity));
}

/**
 * Splits a platform fee across fills proportionally to their exact totals.
 * The last fill with a known total absorbs the rounding remainder so the
 * per-fill fees always add up to the input fee. Fills without a known total
 * get a null fee.
 */
export function prorateFee(totalFee: string, fillTotals: Array<string | null>): Array<string | null> {
  const feeMicro = usdcToMicro(totalFee);
  const totalsMicro = fillTotals.map((t) => (t === null ? null : usdcToMicro(t)));
  const grand = totalsMicro.reduce<bigint>((sum, t) => (t === null ? sum : sum + t), BigInt(0));
  if (grand <= BigInt(0)) {
    return fillTotals.map((t, i) => (t === null ? null : i === 0 ? totalFee : microToUsdc(BigInt(0))));
  }
  const lastKnown = totalsMicro.reduce((last, t, i) => (t === null ? last : i), -1);
  let assigned = BigInt(0);
  return totalsMicro.map((t, i) => {
    if (t === null) {
      return null;
    }
    if (i === lastKnown) {
      return microToUsdc(feeMicro - assigned);
    }
    const share = (feeMicro * t) / grand;
    assigned += share;
    return microToUsdc(share);
  });
}

export interface PlannedFillResult {
  fills: SettledFill[];
  /** Quantity per log index that no active listing of that seller covered. */
  shortfalls: Array<{ logIndex: number; sellerWallet: string; missing: number }>;
}

/**
 * Plans fills from the buy transaction's ERC20 Transfer logs against the
 * asset's active listings. Each Transfer log (seller -> buyer) becomes one
 * fill; its quantity is consumed from that seller's active listings cheapest
 * first, which mirrors the contract's price-sorted resale walk. Pure function
 * so the settlement math is unit testable.
 */
export function planFills(
  listings: IndexerListing[],
  transferLogs: TransferLogRecord[],
  sellerUserIds: Map<string, string | null>,
): PlannedFillResult {
  const working = listings
    .filter((l) => l.status === 'active' && l.quantity > 0)
    .map((l) => ({ listing: l, remaining: l.quantity, priceMicro: usdcToMicro(l.pricePerFraction) }))
    .sort((a, b) => (a.priceMicro < b.priceMicro ? -1 : a.priceMicro > b.priceMicro ? 1 : 0));

  const fills: SettledFill[] = [];
  const shortfalls: PlannedFillResult['shortfalls'] = [];

  for (const log of transferLogs) {
    const seller = log.from;
    const sellerUserId = sellerUserIds.get(seller) ?? null;
    let remaining = toSafeNumber(log.value, 'transfer value');
    const parts: FillPart[] = [];
    let totalMicro = BigInt(0);

    for (const entry of working) {
      if (remaining <= 0) {
        break;
      }
      if (entry.remaining <= 0 || sellerUserId === null || entry.listing.listerId !== sellerUserId) {
        continue;
      }
      const take = Math.min(entry.remaining, remaining);
      entry.remaining -= take;
      remaining -= take;
      totalMicro += entry.priceMicro * BigInt(take);
      parts.push({ listingId: entry.listing.id, quantity: take, priceMicro: entry.priceMicro });
    }

    const quantity = toSafeNumber(log.value, 'transfer value');
    const covered = quantity - remaining;
    if (remaining > 0) {
      shortfalls.push({ logIndex: log.logIndex, sellerWallet: seller, missing: remaining });
    }

    fills.push({
      logIndex: log.logIndex,
      sellerWallet: seller,
      sellerUserId,
      quantity,
      pricePerFraction: covered > 0 && remaining === 0 ? weightedPrice(totalMicro, quantity) : null,
      total: covered > 0 && remaining === 0 ? microToUsdc(totalMicro) : null,
      fee: null,
      listingId: parts.length > 0 ? parts[0].listingId : null,
      parts,
    });
  }

  return { fills, shortfalls };
}

export async function handleNftFractionalized(
  event: CoreChainEvent,
  deps: IndexerDeps,
): Promise<ProcessOutcome> {
  const args = argsRecord(event.args);
  const nftId = toSafeNumber(argBigInt(args, 'nftId'), 'nftId');
  const token = argAddress(args, 'erc20TokenAddress');
  const totalSupplyBig = argBigInt(args, 'totalSupply');
  const totalSupply = toSafeNumber(totalSupplyBig, 'totalSupply');
  const priceMicro = argBigInt(args, 'pricePerFraction');
  const priceStr = microToUsdc(priceMicro);

  const existing = await deps.getAssetByErc20(token);
  if (existing && (existing.status === 'active' || existing.status === 'sold_out')) {
    return { outcome: 'skipped', detail: `asset ${existing.id} already promoted for token ${token}` };
  }

  // Match by mint transaction hash first; fall back to the oldest minting
  // asset owned by the transaction sender (the app may not have recorded
  // setAssetMinting yet, or recorded a normalized hash).
  let asset = existing ?? (await deps.getAssetByMintTxHash(event.txHash));
  if (!asset) {
    const sender = await deps.getTxSender(event.txHash);
    if (sender) {
      asset = await deps.getOldestMintingAssetForWallet(sender);
    }
  }
  if (!asset) {
    return { outcome: 'retry', detail: `no draft or minting asset matches mint tx ${event.txHash}` };
  }

  let promoted = await deps.promoteAssetToActive(asset.id, {
    nftId,
    erc20TokenAddress: token,
    totalSupply,
    mintTxHash: event.txHash,
  });
  if (!promoted) {
    // Not in draft or minting anymore: confirm a concurrent replay promoted
    // this same asset, otherwise retry later.
    const current = await deps.getAssetByErc20(token);
    if (!current || current.id !== asset.id) {
      return { outcome: 'retry', detail: `asset ${asset.id} not promotable and token ${token} unmatched` };
    }
    promoted = current;
  }

  // Seed the business holding: the contract mints the full supply to the
  // creator's wallet and auto-lists it, so quantity and locked both start at
  // totalSupply.
  const holding = await deps.getHolding(promoted.businessId, promoted.id);
  if (!holding || holding.quantity === 0) {
    const applied = await retryNull(() =>
      deps.applyHoldingDelta({
        userId: promoted.businessId,
        assetId: promoted.id,
        deltaQuantity: totalSupply,
        priceForAvg: priceStr,
      }),
    );
    if (applied) {
      await deps.lockHoldingQuantity(promoted.businessId, promoted.id, totalSupply);
    } else {
      await deps.writeAudit({
        action: 'indexer.mint_holding_seed_failed',
        entity: 'assets',
        entityId: promoted.id,
        diff: { txHash: event.txHash, totalSupply },
      });
    }
  }

  const listings = await deps.getActiveListingsForAsset(promoted.id);
  const primary = listings.find((l) => l.kind === 'primary' && l.listerId === promoted.businessId);
  if (!primary) {
    await deps.createListing({
      assetId: promoted.id,
      listerId: promoted.businessId,
      kind: 'primary',
      quantity: totalSupply,
      pricePerFraction: priceStr,
      txHash: event.txHash,
    });
  }

  await deps.recordTransaction({
    type: 'mint',
    assetId: promoted.id,
    toUserId: promoted.businessId,
    toWallet: promoted.businessWallet,
    quantity: totalSupply,
    pricePerFraction: priceStr,
    total: microToUsdc(priceMicro * totalSupplyBig),
    fee: '0',
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    logIndex: event.logIndex,
  });

  return { outcome: 'processed', detail: `asset ${promoted.id} promoted, nft ${nftId}, token ${token}` };
}

export async function handleFractionBought(
  event: CoreChainEvent,
  deps: IndexerDeps,
): Promise<ProcessOutcome> {
  const args = argsRecord(event.args);
  const buyer = argAddress(args, 'buyer');
  const token = argAddress(args, 'erc20Token');
  const amount = toSafeNumber(argBigInt(args, 'amount'), 'amount');
  const pricePaidMicro = argBigInt(args, 'pricePaid');

  const asset = await deps.getAssetByErc20(token);
  if (!asset) {
    return { outcome: 'retry', detail: `unknown fraction token ${token} (mint not processed yet)` };
  }

  const order = await deps.getOrderByTxHash(event.txHash);
  if (order && order.status === 'settled') {
    return { outcome: 'skipped', detail: `order ${order.id} already settled for tx ${event.txHash}` };
  }

  // Sellers are only identifiable from the ERC20 Transfer logs of the same
  // transaction (the event carries the aggregate only).
  const allTransfers = await deps.getTransferLogsForTx(event.chainId, event.txHash, token);
  const transferLogs = allTransfers.filter(
    (t) => t.to === buyer && t.from !== buyer && t.from !== ZERO_ADDRESS,
  );
  if (transferLogs.length === 0) {
    return { outcome: 'retry', detail: `no ERC20 transfer logs found yet for buy tx ${event.txHash}` };
  }

  const buyerUser = await deps.getUserByWallet(buyer);
  const sellerUserIds = new Map<string, string | null>();
  for (const log of transferLogs) {
    if (!sellerUserIds.has(log.from)) {
      const seller = await deps.getUserByWallet(log.from);
      sellerUserIds.set(log.from, seller ? seller.id : null);
    }
  }

  const listings = await deps.getActiveListingsForAsset(asset.id);
  const { fills, shortfalls } = planFills(listings, transferLogs, sellerUserIds);

  // Chain truth check: transfers must add up to the event amount.
  const transferredQty = fills.reduce((sum, f) => sum + f.quantity, 0);
  if (transferredQty !== amount) {
    await deps.writeAudit({
      action: 'indexer.buy_amount_mismatch',
      entity: 'assets',
      entityId: asset.id,
      diff: { txHash: event.txHash, eventAmount: amount, transferredQty },
    });
  }

  const fillTotalMicro = fills.reduce<bigint>(
    (sum, f) => (f.total === null ? sum : sum + usdcToMicro(f.total)),
    BigInt(0),
  );
  if (shortfalls.length > 0 || fillTotalMicro !== pricePaidMicro) {
    await deps.writeAudit({
      action: 'indexer.buy_listing_drift',
      entity: 'assets',
      entityId: asset.id,
      diff: {
        txHash: event.txHash,
        pricePaid: microToUsdc(pricePaidMicro),
        matchedTotal: microToUsdc(fillTotalMicro),
        shortfalls: shortfalls.map((s) => ({ ...s })),
      },
    });
  }

  // Fee attribution per fill: prorated from the quoted order fee when an
  // order exists. Direct contract buys carry no fee information in the event.
  const fees = order
    ? prorateFee(order.platformFee, fills.map((f) => f.total))
    : fills.map(() => null);
  fills.forEach((fill, i) => {
    fill.fee = fees[i];
  });

  let appliedQty = 0;
  let appliedFills = 0;
  let replayedFills = 0;

  for (const fill of fills) {
    // Per-fill idempotency marker: the transactions row keyed on
    // (tx_hash, log_index) is written after the fill's mutations, so a replay
    // only re-applies fills whose marker is missing.
    if (await deps.transactionExists(event.txHash, fill.logIndex)) {
      replayedFills += 1;
      continue;
    }

    for (const part of fill.parts) {
      const decremented = await retryNull(() =>
        deps.decrementListingQuantity(part.listingId, part.quantity),
      );
      if (!decremented) {
        await deps.writeAudit({
          action: 'indexer.buy_listing_decrement_failed',
          entity: 'listings',
          entityId: part.listingId,
          diff: { txHash: event.txHash, logIndex: fill.logIndex, quantity: part.quantity },
        });
      }
    }

    if (fill.sellerUserId) {
      // Listed fractions are locked; release the sold quantity before the
      // decrement so the locked_quantity <= quantity invariant holds.
      const sellerHolding = await deps.getHolding(fill.sellerUserId, asset.id);
      if (sellerHolding && sellerHolding.lockedQuantity > 0) {
        await deps.unlockHoldingQuantity(
          fill.sellerUserId,
          asset.id,
          Math.min(sellerHolding.lockedQuantity, fill.quantity),
        );
      }
      const sellerApplied = await retryNull(() =>
        deps.applyHoldingDelta({
          userId: fill.sellerUserId as string,
          assetId: asset.id,
          deltaQuantity: -fill.quantity,
        }),
      );
      if (!sellerApplied) {
        await deps.writeAudit({
          action: 'indexer.buy_seller_holding_drift',
          entity: 'holdings',
          entityId: null,
          diff: { txHash: event.txHash, seller: fill.sellerWallet, quantity: fill.quantity },
        });
      }
    } else {
      await deps.writeAudit({
        action: 'indexer.buy_unknown_seller',
        entity: 'assets',
        entityId: asset.id,
        diff: { txHash: event.txHash, seller: fill.sellerWallet, quantity: fill.quantity },
      });
    }

    if (buyerUser) {
      await retryNull(() =>
        deps.applyHoldingDelta({
          userId: buyerUser.id,
          assetId: asset.id,
          deltaQuantity: fill.quantity,
          ...(fill.pricePerFraction !== null ? { priceForAvg: fill.pricePerFraction } : {}),
        }),
      );
    }

    await deps.recordTransaction({
      type: 'buy',
      assetId: asset.id,
      orderId: order ? order.id : null,
      listingId: fill.listingId,
      fromUserId: fill.sellerUserId,
      toUserId: buyerUser ? buyerUser.id : null,
      fromWallet: fill.sellerWallet,
      toWallet: buyer,
      quantity: fill.quantity,
      pricePerFraction: fill.pricePerFraction,
      total: fill.total,
      fee: fill.fee,
      txHash: event.txHash,
      blockNumber: event.blockNumber,
      logIndex: fill.logIndex,
    });

    appliedQty += fill.quantity;
    appliedFills += 1;
  }

  if (appliedQty > 0) {
    const newAvailable = Math.max((asset.availableSupply ?? 0) - appliedQty, 0);
    await deps.updateAssetSupply(asset.id, newAvailable);
    if (newAvailable === 0) {
      await deps.setAssetStatus(asset.id, 'sold_out');
    }
  }

  if (order) {
    const settled = await deps.settleOrder(order.id, { txHash: event.txHash, fills });
    if (!settled) {
      await deps.writeAudit({
        action: 'indexer.order_settle_race',
        entity: 'orders',
        entityId: order.id,
        diff: { txHash: event.txHash },
      });
    }
  } else if (buyerUser) {
    // Browser-was-closed case: the buy confirmed on chain but no order was
    // ever submitted, so record a settled order for the buyer's history.
    // The platform fee charged on chain is not in the event, so it is
    // recorded as 0 on this synthetic order.
    await deps.createSettledOrder({
      buyerId: buyerUser.id,
      assetId: asset.id,
      quantity: amount,
      quotedTotal: microToUsdc(pricePaidMicro),
      platformFee: '0',
      txHash: event.txHash,
      fills,
    });
  } else {
    await deps.writeAudit({
      action: 'indexer.buy_unknown_buyer',
      entity: 'assets',
      entityId: asset.id,
      diff: { txHash: event.txHash, buyer, amount },
    });
  }

  return {
    outcome: 'processed',
    detail: `settled ${appliedFills} fill(s) (${replayedFills} replayed) for asset ${asset.id}`,
  };
}

export async function handleErc20Transfer(
  event: CoreChainEvent,
  deps: IndexerDeps,
): Promise<ProcessOutcome> {
  if (!event.contractAddress) {
    return { outcome: 'skipped', detail: 'transfer event without token address' };
  }
  const token = event.contractAddress.toLowerCase();
  const args = argsRecord(event.args);
  const from = argAddress(args, 'from');
  const to = argAddress(args, 'to');
  const quantity = toSafeNumber(argBigInt(args, 'value'), 'value');

  const asset = await deps.getAssetByErc20(token);
  if (!asset) {
    return { outcome: 'skipped', detail: `token ${token} is not a known fraction token` };
  }
  if (from === ZERO_ADDRESS || to === ZERO_ADDRESS) {
    return { outcome: 'skipped', detail: 'mint or burn transfer (handled by NFTFractionalized)' };
  }
  if (from === to || quantity === 0) {
    return { outcome: 'skipped', detail: 'self transfer or zero value' };
  }
  if (await deps.hasFractionBoughtInTx(event.chainId, event.txHash)) {
    return { outcome: 'skipped', detail: 'transfer inside a buy tx (FractionBought settles it)' };
  }
  if (await deps.getOrderByTxHash(event.txHash)) {
    return { outcome: 'skipped', detail: 'transfer belongs to a tracked order tx' };
  }
  if (await deps.transactionExists(event.txHash, event.logIndex)) {
    return { outcome: 'skipped', detail: 'transfer already recorded' };
  }

  const fromUser = await deps.getUserByWallet(from);
  const toUser = await deps.getUserByWallet(to);
  if (!fromUser && !toUser) {
    await deps.writeAudit({
      action: 'indexer.transfer_unknown_wallets',
      entity: 'assets',
      entityId: asset.id,
      diff: { txHash: event.txHash, from, to, quantity },
    });
    return { outcome: 'skipped', detail: 'transfer between unknown wallets' };
  }

  if (fromUser) {
    const holding = await deps.getHolding(fromUser.id, asset.id);
    if (holding) {
      const unlockedAfter = holding.quantity - quantity;
      if (unlockedAfter < holding.lockedQuantity) {
        // The sender moved fractions that back an open listing (no escrow on
        // chain). Release the deficit so the holding invariant holds, and
        // leave a trace for reconciliation.
        const deficit = Math.min(holding.lockedQuantity, holding.lockedQuantity - Math.max(unlockedAfter, 0));
        await deps.unlockHoldingQuantity(fromUser.id, asset.id, deficit);
        await deps.writeAudit({
          action: 'indexer.transfer_moved_locked_fractions',
          entity: 'holdings',
          entityId: holding.id,
          diff: { txHash: event.txHash, from, quantity, unlockedDeficit: deficit },
        });
      }
    }
    const applied = await retryNull(() =>
      deps.applyHoldingDelta({ userId: fromUser.id, assetId: asset.id, deltaQuantity: -quantity }),
    );
    if (!applied) {
      await deps.writeAudit({
        action: 'indexer.transfer_sender_holding_drift',
        entity: 'assets',
        entityId: asset.id,
        diff: { txHash: event.txHash, from, quantity },
      });
    }
  }

  if (toUser) {
    // No priceForAvg: a transfer carries no price, so the recipient's average
    // entry price is left untouched (null for a brand new holding).
    await retryNull(() =>
      deps.applyHoldingDelta({ userId: toUser.id, assetId: asset.id, deltaQuantity: quantity }),
    );
  }

  await deps.recordTransaction({
    type: 'transfer',
    assetId: asset.id,
    fromUserId: fromUser ? fromUser.id : null,
    toUserId: toUser ? toUser.id : null,
    fromWallet: from,
    toWallet: to,
    quantity,
    fee: '0',
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    logIndex: event.logIndex,
  });

  return { outcome: 'processed', detail: `transfer of ${quantity} on asset ${asset.id}` };
}

export async function handleRoyaltyDistributed(
  event: CoreChainEvent,
  deps: IndexerDeps,
): Promise<ProcessOutcome> {
  const args = argsRecord(event.args);
  const token = argAddress(args, 'erc20Token');
  const amount = argBigInt(args, 'amount');
  const timestamp = argBigInt(args, 'timestamp');

  const asset = await deps.getAssetByErc20(token);

  // Documented decision: no tx_type in the enum fits a revenue distribution
  // ('buy' and 'onramp' would misrepresent it), so this event is recorded in
  // audit_log only and no transactions row is written. Follow-up: add a
  // 'royalty' tx_type in a future migration and backfill from these entries.
  await deps.writeAudit({
    action: 'indexer.royalty_distributed',
    entity: 'assets',
    entityId: asset ? asset.id : null,
    diff: {
      chainId: event.chainId,
      txHash: event.txHash,
      blockNumber: event.blockNumber,
      logIndex: event.logIndex,
      erc20Token: token,
      amountWei: amount.toString(),
      chainTimestamp: timestamp.toString(),
    },
  });

  return { outcome: 'processed', detail: `royalty distribution recorded in audit_log for token ${token}` };
}

/** Dispatches one chain_events row to its handler. */
export async function processChainEvent(
  event: CoreChainEvent,
  deps: IndexerDeps,
): Promise<ProcessOutcome> {
  try {
    switch (event.eventName) {
      case 'NFTFractionalized':
        return await handleNftFractionalized(event, deps);
      case 'FractionBought':
        return await handleFractionBought(event, deps);
      case 'Transfer':
        return await handleErc20Transfer(event, deps);
      case 'RoyaltyDistributed':
        return await handleRoyaltyDistributed(event, deps);
      default:
        return { outcome: 'skipped', detail: `no handler for event ${event.eventName}` };
    }
  } catch (error) {
    if (error instanceof EventArgsError) {
      // Malformed args never fix themselves on replay; record and move on.
      await deps.writeAudit({
        action: 'indexer.malformed_event_args',
        entity: 'chain_events',
        diff: {
          eventName: event.eventName,
          txHash: event.txHash,
          logIndex: event.logIndex,
          message: error.message,
        },
      });
      return { outcome: 'skipped', detail: `malformed args: ${error.message}` };
    }
    throw error;
  }
}
