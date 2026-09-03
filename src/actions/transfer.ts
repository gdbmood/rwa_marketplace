'use server';

import { requireUser } from '@/lib/auth/session';
import { getAssetById } from '@/lib/db/assets';
import { getUserByWallet } from '@/lib/db/users';
import { type TransactionRow, recordTransaction } from '@/lib/db/transactions';
import { findErc20TransferLog, verifyTxReceipt } from '@/actions/chain';
import { type ActionResult, err, ok, toActionError } from '@/actions/result';
import { isPositiveInteger, isTxHash, isUuid, isWalletAddress } from '@/actions/validate';

export interface RecordTransferInput {
  assetId: string;
  toWallet: string;
  quantity: number;
  /** Hash of the on-chain ERC20 transfer transaction. */
  txHash: string;
}

/**
 * Records a fraction transfer in the ledger after verifying the transaction
 * receipt carries a Transfer log on the asset's fraction token from the
 * caller's wallet to the recipient. Holdings are NOT touched here: the
 * indexer observes the same Transfer log and is authoritative for balances.
 */
export async function recordTransfer(
  input: RecordTransferInput,
): Promise<ActionResult<TransactionRow>> {
  try {
    const { user, wallet } = await requireUser();

    if (!isUuid(input.assetId)) {
      return err('invalid_input', 'assetId must be a valid id');
    }
    if (!isWalletAddress(input.toWallet)) {
      return err('invalid_input', 'toWallet must be a wallet address');
    }
    if (!isPositiveInteger(input.quantity)) {
      return err('invalid_input', 'quantity must be a positive integer');
    }
    if (!isTxHash(input.txHash)) {
      return err('invalid_input', 'txHash must be a transaction hash');
    }

    const toWallet = input.toWallet.toLowerCase();
    if (toWallet === wallet) {
      return err('invalid_input', 'You cannot transfer fractions to yourself');
    }

    const asset = await getAssetById(input.assetId);
    if (!asset) {
      return err('not_found', 'Asset not found');
    }
    if (!asset.erc20_token_address) {
      return err('conflict', 'Asset has no fraction token yet');
    }

    const check = await verifyTxReceipt(input.txHash, [asset.erc20_token_address]);
    if (!check.ok) {
      return err('chain_error', check.reason);
    }

    const transferLog = findErc20TransferLog(check.receipt, asset.erc20_token_address);
    if (!transferLog) {
      return err('chain_error', 'No fraction transfer found in that transaction');
    }
    if (transferLog.fromWallet !== wallet || transferLog.toWallet !== toWallet) {
      return err('chain_error', 'Transfer parties do not match the transaction');
    }

    const recipient = await getUserByWallet(toWallet);

    const transaction = await recordTransaction({
      type: 'transfer',
      assetId: input.assetId,
      fromUserId: user.id,
      toUserId: recipient?.id ?? null,
      fromWallet: wallet,
      toWallet,
      quantity: input.quantity,
      fee: 0,
      txHash: input.txHash,
      blockNumber: transferLog.blockNumber,
      logIndex: transferLog.logIndex,
    });

    return ok(transaction);
  } catch (error) {
    return toActionError(error, 'transfer.recordTransfer');
  }
}
