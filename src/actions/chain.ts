import 'server-only';

import { defineChain, readContract } from 'thirdweb';
import { eth_getTransactionReceipt, getRpcClient } from 'thirdweb/rpc';
import { client, contract } from '@/lib/thirdWebClient';
import { publicEnv } from '@/lib/env';
import { fetchPlatformFee } from '@/utils/ABI';

/** Receipt shape as returned by the thirdweb RPC helper (viem-formatted). */
export type TransactionReceipt = Awaited<ReturnType<typeof eth_getTransactionReceipt>>;

/** keccak256("Transfer(address,address,uint256)") */
export const ERC20_TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/**
 * Known ERC-4337 EntryPoint addresses (v0.6 and v0.7). Transactions sent
 * through account abstraction target the EntryPoint, not the marketplace, so
 * receipt target checks must tolerate them. The inner call target cannot be
 * proven here without decoding the user operation; the indexer and reconcile
 * job remain the authority on chain state.
 */
const ENTRY_POINT_ADDRESSES = new Set([
  '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789',
  '0x0000000071727de22e5e9d8baf0edac6f37da032',
]);

/**
 * Chain used for server-side receipt verification. Prefers INDEXER_RPC_URL so
 * verification and indexing read the same node; falls back to the thirdweb
 * default RPC for the configured chain id.
 */
function getVerificationChain() {
  const chainId = publicEnv.thirdwebChainId;
  const rpcUrl = process.env.INDEXER_RPC_URL;
  return rpcUrl ? defineChain({ id: chainId, rpc: rpcUrl }) : defineChain(chainId);
}

export type ReceiptCheck =
  | { ok: true; receipt: TransactionReceipt }
  | { ok: false; reason: string };

/**
 * Fetches a transaction receipt and checks that it exists, succeeded, and
 * touched one of the expected contracts (as the transaction target or as a
 * log emitter). An ERC-4337 EntryPoint target is accepted because account
 * abstraction wraps the real call.
 */
export async function verifyTxReceipt(
  txHash: string,
  involvedAddresses: string[],
): Promise<ReceiptCheck> {
  const rpcRequest = getRpcClient({ client, chain: getVerificationChain() });

  let receipt: TransactionReceipt;
  try {
    receipt = await eth_getTransactionReceipt(rpcRequest, { hash: txHash as `0x${string}` });
  } catch {
    return { ok: false, reason: 'Transaction not found on chain' };
  }

  if (receipt.status !== 'success') {
    return { ok: false, reason: 'Transaction reverted on chain' };
  }

  const expected = new Set(involvedAddresses.map((address) => address.toLowerCase()));
  const target = receipt.to?.toLowerCase() ?? '';
  const targetMatches = expected.has(target) || ENTRY_POINT_ADDRESSES.has(target);
  const logMatches = receipt.logs.some((log) => expected.has(log.address.toLowerCase()));

  if (!targetMatches && !logMatches) {
    return { ok: false, reason: 'Transaction did not touch the expected contract' };
  }

  return { ok: true, receipt };
}

export interface Erc20TransferLog {
  fromWallet: string;
  toWallet: string;
  logIndex: number | null;
  blockNumber: number | null;
}

/**
 * Finds the first ERC20 Transfer log emitted by tokenAddress in the receipt
 * and decodes the indexed from/to addresses. Null when the receipt carries no
 * such transfer.
 */
export function findErc20TransferLog(
  receipt: TransactionReceipt,
  tokenAddress: string,
): Erc20TransferLog | null {
  const token = tokenAddress.toLowerCase();
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== token) {
      continue;
    }
    if (log.topics[0]?.toLowerCase() !== ERC20_TRANSFER_TOPIC || log.topics.length < 3) {
      continue;
    }
    return {
      fromWallet: topicToAddress(log.topics[1] as string),
      toWallet: topicToAddress(log.topics[2] as string),
      logIndex: log.logIndex === null ? null : Number(log.logIndex),
      blockNumber: log.blockNumber === null ? null : Number(log.blockNumber),
    };
  }
  return null;
}

function topicToAddress(topic: string): string {
  return `0x${topic.slice(-40)}`.toLowerCase();
}

const PLATFORM_FEE_TTL_MS = 5 * 60 * 1000;

let platformFeeCache: { valueBps: bigint; fetchedAt: number } | null = null;

/**
 * Platform fee in basis points from the marketplace contract's platformFee()
 * view, cached for five minutes per server process.
 */
export async function getPlatformFeeBps(): Promise<bigint> {
  if (platformFeeCache && Date.now() - platformFeeCache.fetchedAt < PLATFORM_FEE_TTL_MS) {
    return platformFeeCache.valueBps;
  }
  const valueBps = await readContract({ contract, method: fetchPlatformFee });
  platformFeeCache = { valueBps, fetchedAt: Date.now() };
  return valueBps;
}
