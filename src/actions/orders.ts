'use server';

import type { Json } from '@/types/database';
import { requireUser } from '@/lib/auth/session';
import { getAssetById } from '@/lib/db/assets';
import { getActiveListingsForAsset } from '@/lib/db/listings';
import {
  type OrderRow,
  createOrder,
  failOrder as failOrderRow,
  getOrderById,
  getOrdersForUser,
  transitionOrder,
} from '@/lib/db/orders';
import { getApprovedKycForUser } from '@/lib/db/kyc';
import { getPlatformFeeBps } from '@/actions/chain';
import {
  type QuotedFill,
  computePlatformFeeMicro,
  fromMicroUsdc,
  quoteFills,
} from '@/actions/quote';
import { type ActionResult, err, ok, toActionError } from '@/actions/result';
import { cleanString, isPositiveInteger, isTxHash, isUuid } from '@/actions/validate';

const ORDER_TTL_MS = 30 * 60 * 1000;
const PAYMENT_METHODS = ['usdc', 'card', 'swap'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const MAX_FAILURE_REASON_LENGTH = 500;

export interface CreateBuyOrderResult {
  order: OrderRow;
  /** The quoted fills, cheapest listings first. Also stored on the order row. */
  fills: QuotedFill[];
  /** Order total before fee, USDC units. */
  total: string;
  /** Platform fee, USDC units. */
  platformFee: string;
  /** The fee rate used, in basis points. */
  feeBps: number;
}

/**
 * Quotes and creates a buy order: KYC gate, fills from active listings
 * cheapest first, platform fee from the chain (cached five minutes), a fills
 * snapshot in jsonb, and a 30 minute expiry. The client then executes the
 * on-chain purchase and reports the hash via submitOrderTx.
 */
export async function createBuyOrder(
  assetId: string,
  quantity: number,
  paymentMethod: PaymentMethod = 'usdc',
): Promise<ActionResult<CreateBuyOrderResult>> {
  try {
    const { user } = await requireUser();

    if (!isUuid(assetId)) {
      return err('invalid_input', 'assetId must be a valid id');
    }
    if (!isPositiveInteger(quantity)) {
      return err('invalid_input', 'quantity must be a positive integer');
    }
    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      return err('invalid_input', `paymentMethod must be one of ${PAYMENT_METHODS.join(', ')}`);
    }

    const asset = await getAssetById(assetId);
    if (!asset) {
      return err('not_found', 'Asset not found');
    }
    if (asset.status !== 'active' || asset.nft_id === null) {
      return err('conflict', 'Asset is not available for purchase');
    }

    if (asset.kyc_required && !user.is_verified) {
      const kyc = await getApprovedKycForUser(user.id);
      if (!kyc) {
        return err('kyc_required', 'This asset requires identity verification before buying');
      }
    }

    const listings = await getActiveListingsForAsset(assetId);
    const quote = quoteFills(
      listings.map((listing) => ({
        listingId: listing.id,
        listerId: listing.lister_id,
        availableQuantity: Number(listing.quantity),
        pricePerFraction: listing.price_per_fraction,
      })),
      quantity,
    );
    if (quote.filledQuantity < quantity) {
      return err(
        'conflict',
        `Only ${quote.filledQuantity} fraction(s) are listed right now`,
      );
    }

    let feeBps: bigint;
    try {
      feeBps = await getPlatformFeeBps();
    } catch (error) {
      console.error('[orders.createBuyOrder] platformFee read failed', error);
      return err('chain_error', 'Could not read the platform fee from chain');
    }
    const feeMicro = computePlatformFeeMicro(quote.totalMicro, feeBps);
    const platformFee = fromMicroUsdc(feeMicro);

    const fills = quote.fills.map((fill) => ({
      listing_id: fill.listingId,
      lister_id: fill.listerId,
      quantity: fill.quantity,
      price_per_fraction: fill.pricePerFraction,
      subtotal: fill.subtotal,
    }));

    const order = await createOrder({
      buyerId: user.id,
      assetId,
      quantity,
      quotedTotal: quote.total,
      platformFee,
      paymentMethod,
      fills: fills as Json,
      expiresAt: new Date(Date.now() + ORDER_TTL_MS).toISOString(),
    });

    return ok({
      order,
      fills: quote.fills,
      total: quote.total,
      platformFee,
      feeBps: Number(feeBps),
    });
  } catch (error) {
    return toActionError(error, 'orders.createBuyOrder');
  }
}

/**
 * Attaches the buy transaction hash and moves the order to submitted. The
 * indexer settles it once the FractionBought event is observed.
 */
export async function submitOrderTx(
  orderId: string,
  txHash: string,
): Promise<ActionResult<OrderRow>> {
  try {
    const { user } = await requireUser();

    if (!isUuid(orderId)) {
      return err('invalid_input', 'orderId must be a valid id');
    }
    if (!isTxHash(txHash)) {
      return err('invalid_input', 'txHash must be a transaction hash');
    }

    const order = await getOrderById(orderId);
    if (!order || order.buyer_id !== user.id) {
      return err('not_found', 'Order not found');
    }

    const updated = await transitionOrder(orderId, ['created', 'funded'], 'submitted', {
      tx_hash: txHash,
    });
    if (!updated) {
      return err('conflict', `Order can no longer be submitted (status: ${order.status})`);
    }
    return ok(updated);
  } catch (error) {
    return toActionError(error, 'orders.submitOrderTx');
  }
}

/** Marks the caller's order as failed with a reason (e.g. a reverted tx). */
export async function failOrder(
  orderId: string,
  reason: string,
): Promise<ActionResult<OrderRow>> {
  try {
    const { user } = await requireUser();

    if (!isUuid(orderId)) {
      return err('invalid_input', 'orderId must be a valid id');
    }
    const cleanReason = cleanString(reason, MAX_FAILURE_REASON_LENGTH);
    if (!cleanReason) {
      return err('invalid_input', 'A failure reason is required');
    }

    const order = await getOrderById(orderId);
    if (!order || order.buyer_id !== user.id) {
      return err('not_found', 'Order not found');
    }

    const failed = await failOrderRow(orderId, cleanReason);
    if (!failed) {
      return err('conflict', `Order is already ${order.status}`);
    }
    return ok(failed);
  } catch (error) {
    return toActionError(error, 'orders.failOrder');
  }
}

/** The caller's orders, newest first. */
export async function getMyOrders(): Promise<ActionResult<OrderRow[]>> {
  try {
    const { user } = await requireUser();
    const orders = await getOrdersForUser(user.id);
    return ok(orders);
  } catch (error) {
    return toActionError(error, 'orders.getMyOrders');
  }
}

/** Current state of one of the caller's orders (for status polling). */
export async function getOrderStatus(orderId: string): Promise<ActionResult<OrderRow>> {
  try {
    const { user } = await requireUser();

    if (!isUuid(orderId)) {
      return err('invalid_input', 'orderId must be a valid id');
    }

    const order = await getOrderById(orderId);
    if (!order || order.buyer_id !== user.id) {
      return err('not_found', 'Order not found');
    }
    return ok(order);
  } catch (error) {
    return toActionError(error, 'orders.getOrderStatus');
  }
}
