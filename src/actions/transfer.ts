'use server';

import { requireUser } from '@/lib/auth/session';
import { getAssetById } from '@/lib/db/assets';
import { getUserByWallet } from '@/lib/db/users';
import {
  type TransactionRow,
  getTransactionByTxLog,
  recordTransaction,
} from '@/lib/db/transactions';
import { findErc20TransferLog, verifyTxReceipt } from '@/actions/chain';
import { type ActionResult, err, ok, toActionError } from '@/actions/result';
import { isPositiveInteger, isTxHash, isUuid, isWalletAddress } from '@/actions/validate';

/**
 * How long to wait for the indexer to record the transfer itself before
 * falling back to a direct ledger write. The indexer skips holdings work for
 * a Transfer event whose (tx_hash, log_index) ledger row already exists, so
 * writing the row here first would leave both parties' balances stale until
 * a manual reconcile. Overridable for environments with a slower indexer.
 */
const INDEXER_RECORD_WAIT_MS = (() => {
  const parsed = Number.parseInt(process.env.TRANSFER_RECORD_WAIT_MS ?? '', 10);
  return Number.isNaN(parsed) || parsed < 0 ? 15_000 : parsed;
})();
const INDEXER_RECORD_POLL_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

    // Prefer the indexer's own ledger row: the indexer observes the same
    // Transfer log, moves BOTH parties' holdings and writes the transactions
    // row keyed on (tx_hash, log_index). If this action wrote that row first,
    // the indexer would treat the event as already recorded and skip the
    // holdings update entirely, so give it a bounded window to land first.
    if (transferLog.logIndex !== null) {
      const deadline = Date.now() + INDEXER_RECORD_WAIT_MS;
      for (;;) {
        const indexed = await getTransactionByTxLog(input.txHash, transferLog.logIndex);
        if (indexed) {
          return ok(indexed);
        }
        if (Date.now() >= deadline) {
          break;
        }
        await sleep(INDEXER_RECORD_POLL_MS);
      }
    }

    // Fallback (indexer down or badly behind): record the ledger row directly
    // so the user's history is not lost. Holdings then wait on the reconcile
    // pass, which matches the pre-existing behavior of this path.
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
