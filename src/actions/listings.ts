'use server';

import { requireUser } from '@/lib/auth/session';
import { getAssetById, setAssetStatus } from '@/lib/db/assets';
import {
  type ListingRow,
  cancelListing as cancelListingRow,
  createListing,
  getListingsByLister,
  updateListingPrice as updateListingPriceRow,
} from '@/lib/db/listings';
import { lockHoldingQuantity, unlockHoldingQuantity } from '@/lib/db/holdings';
import { recordTransaction } from '@/lib/db/transactions';
import { isUniqueViolation } from '@/lib/db/helpers';
import { publicEnv } from '@/lib/env';
import { verifyTxReceipt } from '@/actions/chain';
import { fromMicroUsdc, toMicroUsdc } from '@/actions/quote';
import { type ActionResult, err, ok, toActionError } from '@/actions/result';
import { isPositiveInteger, isTxHash, isUuid } from '@/actions/validate';

export interface RecordSecondaryListingInput {
  assetId: string;
  quantity: number;
  /** Price per fraction in USDC units (numeric string or number). */
  pricePerFraction: string | number;
  /** Hash of the on-chain sellFractions transaction. */
  txHash: string;
}

export interface UpdateListingPriceInput {
  listingId: string;
  /** New price per fraction in USDC units. */
  newPrice: string | number;
  /** Hash of the on-chain updateListing transaction. */
  txHash: string;
}

export interface CancelListingInput {
  listingId: string;
  /** Hash of the on-chain unlistFractions transaction. */
  txHash: string;
}

function parsePrice(value: string | number): string | null {
  try {
    const micro = toMicroUsdc(value);
    if (micro <= BigInt(0)) {
      return null;
    }
    return fromMicroUsdc(micro);
  } catch {
    return null;
  }
}

/**
 * Records a resale listing after the seller's sellFractions transaction. The
 * receipt is verified server side (existence, success, expected contracts)
 * because the deployed contract emits no events for resale operations. Locks
 * the listed fractions on the seller's holding.
 */
export async function recordSecondaryListing(
  input: RecordSecondaryListingInput,
): Promise<ActionResult<ListingRow>> {
  try {
    const { user, wallet } = await requireUser();

    if (!isUuid(input.assetId)) {
      return err('invalid_input', 'assetId must be a valid id');
    }
    if (!isPositiveInteger(input.quantity)) {
      return err('invalid_input', 'quantity must be a positive integer');
    }
    const price = parsePrice(input.pricePerFraction);
    if (!price) {
      return err('invalid_input', 'pricePerFraction must be a positive USDC amount');
    }
    if (!isTxHash(input.txHash)) {
      return err('invalid_input', 'txHash must be a transaction hash');
    }

    const asset = await getAssetById(input.assetId);
    if (!asset) {
      return err('not_found', 'Asset not found');
    }
    if (asset.status !== 'active' || !asset.erc20_token_address) {
      return err('conflict', 'Asset is not live yet');
    }

    const involved = [publicEnv.thirdwebContractAddress, asset.erc20_token_address];
    const receipt = await verifyTxReceipt(input.txHash, involved);
    if (!receipt.ok) {
      return err('chain_error', receipt.reason);
    }

    const locked = await lockHoldingQuantity(user.id, input.assetId, input.quantity);
    if (!locked) {
      return err('conflict', 'Not enough unlocked fractions to list');
    }

    let listing: ListingRow;
    try {
      listing = await createListing({
        assetId: input.assetId,
        listerId: user.id,
        kind: 'secondary',
        quantity: input.quantity,
        pricePerFraction: price,
        txHash: input.txHash,
      });
    } catch (error) {
      // Roll the lock back so a rejected listing does not strand fractions.
      await unlockHoldingQuantity(user.id, input.assetId, input.quantity).catch(() => null);
      if (isUniqueViolation(error)) {
        return err('conflict', 'You already have an active listing at this price');
      }
      throw error;
    }

    await recordTransaction({
      type: 'sell_list',
      assetId: input.assetId,
      listingId: listing.id,
      fromUserId: user.id,
      fromWallet: wallet,
      quantity: input.quantity,
      pricePerFraction: price,
      txHash: input.txHash,
    });

    return ok(listing);
  } catch (error) {
    return toActionError(error, 'listings.recordSecondaryListing');
  }
}

/**
 * Updates the price of the caller's active listing after the on-chain
 * updateListing transaction is verified.
 */
export async function updateListingPrice(
  input: UpdateListingPriceInput,
): Promise<ActionResult<ListingRow>> {
  try {
    const { user } = await requireUser();

    if (!isUuid(input.listingId)) {
      return err('invalid_input', 'listingId must be a valid id');
    }
    const price = parsePrice(input.newPrice);
    if (!price) {
      return err('invalid_input', 'newPrice must be a positive USDC amount');
    }
    if (!isTxHash(input.txHash)) {
      return err('invalid_input', 'txHash must be a transaction hash');
    }

    const receipt = await verifyTxReceipt(input.txHash, [publicEnv.thirdwebContractAddress]);
    if (!receipt.ok) {
      return err('chain_error', receipt.reason);
    }

    const updated = await updateListingPriceRow(input.listingId, user.id, price);
    if (!updated) {
      return err('not_found', 'Active listing not found or not yours');
    }

    await recordTransaction({
      type: 'price_update',
      assetId: updated.asset_id,
      listingId: updated.id,
      fromUserId: user.id,
      pricePerFraction: price,
      txHash: input.txHash,
    });

    return ok(updated);
  } catch (error) {
    return toActionError(error, 'listings.updateListingPrice');
  }
}

/**
 * Cancels the caller's active listing after the on-chain unlistFractions
 * transaction is verified, and releases the locked fractions.
 */
export async function cancelListing(
  input: CancelListingInput,
): Promise<ActionResult<ListingRow>> {
  try {
    const { user, wallet } = await requireUser();

    if (!isUuid(input.listingId)) {
      return err('invalid_input', 'listingId must be a valid id');
    }
    if (!isTxHash(input.txHash)) {
      return err('invalid_input', 'txHash must be a transaction hash');
    }

    const receipt = await verifyTxReceipt(input.txHash, [publicEnv.thirdwebContractAddress]);
    if (!receipt.ok) {
      return err('chain_error', receipt.reason);
    }

    const canceled = await cancelListingRow(input.listingId, user.id);
    if (!canceled) {
      return err('not_found', 'Active listing not found or not yours');
    }

    if (canceled.quantity > 0) {
      const unlocked = await unlockHoldingQuantity(
        user.id,
        canceled.asset_id,
        canceled.quantity,
      );
      if (!unlocked) {
        // The indexer's reconcile pass is authoritative for holdings; log and continue.
        console.error(
          `[listings.cancelListing] failed to unlock ${canceled.quantity} fractions for listing ${canceled.id}`,
        );
      }
    }

    // Canceling the primary listing takes the asset off sale: reflect that on
    // the asset row so the dashboard shows it as delisted. Secondary cancels
    // never touch the asset status.
    if (canceled.kind === 'primary') {
      try {
        await setAssetStatus(canceled.asset_id, 'delisted');
      } catch (statusError) {
        // The indexer's reconcile pass is the backstop for asset state.
        console.error('[listings.cancelListing] failed to mark asset delisted:', statusError);
      }
    }

    await recordTransaction({
      type: 'unlist',
      assetId: canceled.asset_id,
      listingId: canceled.id,
      fromUserId: user.id,
      fromWallet: wallet,
      quantity: canceled.quantity,
      pricePerFraction: canceled.price_per_fraction,
      txHash: input.txHash,
    });

    return ok(canceled);
  } catch (error) {
    return toActionError(error, 'listings.cancelListing');
  }
}

/** All listings the caller ever made, newest first. */
export async function listMyListings(): Promise<ActionResult<ListingRow[]>> {
  try {
    const { user } = await requireUser();
    const listings = await getListingsByLister(user.id);
    return ok(listings);
  } catch (error) {
    return toActionError(error, 'listings.listMyListings');
  }
}
