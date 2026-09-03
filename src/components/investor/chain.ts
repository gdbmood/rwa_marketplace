'use client';

import {
  prepareContractCall,
  sendAndConfirmTransaction,
  sendTransaction,
  toUnits,
  waitForReceipt,
} from 'thirdweb';
import type { Account, Wallet } from 'thirdweb/wallets';
import { contract, getContractByAddress } from '@/lib/thirdWebClient';
import { buyNFT, sellNFT, unlistNFT } from '@/utils/ABI';

/**
 * Client-side chain helpers for the investor flows. Fractions are whole
 * integers on chain; prices and USDC amounts are bigint micro USDC (6
 * decimals). USDC decimal strings from the server convert via toUnits.
 */

/** Micro USDC (bigint) from a decimal USDC string or number. */
export function toMicroUsdcUnits(value: string | number): bigint {
  return toUnits(typeof value === 'number' ? value.toFixed(6) : String(value), 6);
}

/** The smart (AA) account among the connected wallets, if any. */
export function getSmartAccount(wallets: Wallet[]): Account | null {
  const smart = wallets.find((wallet) => wallet.id === 'smart');
  return smart?.getAccount() ?? null;
}

/** Approves the marketplace to pull `amountMicro` USDC from the account. */
export async function approveUsdcSpend(
  account: Account,
  amountMicro: bigint,
): Promise<string> {
  const transaction = prepareContractCall({
    contract: getContractByAddress(process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS!),
    method: 'function approve(address to, uint256 amount) returns (bool)',
    params: [contract.address, amountMicro],
  });
  const receipt = await sendAndConfirmTransaction({ transaction, account });
  return receipt.transactionHash;
}

export interface SentBuyTransaction {
  transactionHash: string;
  /** Resolves once the transaction is mined; throws when it reverted. */
  confirmed: () => Promise<void>;
}

/**
 * buyFractions(nftId, amount), split into broadcast and confirmation. The
 * hash is returned as soon as the transaction is sent so the caller can
 * report it through submitOrderTx BEFORE the indexer can observe the mined
 * transaction (order state machine: the order must sit in submitted with its
 * tx_hash first, or the indexer treats the buy as browser-was-closed and
 * synthesizes a duplicate chain_direct order while the real one hangs).
 */
export async function sendBuyFractions(
  account: Account,
  nftId: number,
  quantity: number,
): Promise<SentBuyTransaction> {
  const transaction = prepareContractCall({
    contract,
    method: buyNFT,
    params: [BigInt(nftId), BigInt(quantity)],
  });
  const result = await sendTransaction({ transaction, account });
  return {
    transactionHash: result.transactionHash,
    confirmed: async () => {
      const receipt = await waitForReceipt(result);
      if (receipt.status !== 'success') {
        throw new Error('The purchase transaction reverted on chain');
      }
    },
  };
}

/** Approves the marketplace to move `quantity` fraction tokens. */
export async function approveFractionSpend(
  account: Account,
  erc20TokenAddress: string,
  quantity: number,
): Promise<string> {
  const transaction = prepareContractCall({
    contract: getContractByAddress(erc20TokenAddress),
    method: 'function approve(address spender, uint256 amount) returns (bool)',
    params: [contract.address, BigInt(quantity)],
  });
  const receipt = await sendAndConfirmTransaction({ transaction, account });
  return receipt.transactionHash;
}

/** sellFractions(nftId, amount, pricePerFraction in micro USDC). */
export async function sellFractionsOnChain(
  account: Account,
  nftId: number,
  quantity: number,
  pricePerFractionUsdc: string | number,
): Promise<string> {
  const transaction = prepareContractCall({
    contract,
    method: sellNFT,
    params: [BigInt(nftId), BigInt(quantity), toMicroUsdcUnits(pricePerFractionUsdc)],
  });
  const receipt = await sendAndConfirmTransaction({ transaction, account });
  return receipt.transactionHash;
}

/** unlistFractions(nftId, pricePerFraction in micro USDC). */
export async function unlistFractionsOnChain(
  account: Account,
  nftId: number,
  pricePerFractionUsdc: string | number,
): Promise<string> {
  const transaction = prepareContractCall({
    contract,
    method: unlistNFT,
    params: [BigInt(nftId), toMicroUsdcUnits(pricePerFractionUsdc)],
  });
  const receipt = await sendAndConfirmTransaction({ transaction, account });
  return receipt.transactionHash;
}

/** Plain ERC20 transfer of whole fraction units to another wallet. */
export async function transferFractionsOnChain(
  account: Account,
  erc20TokenAddress: string,
  toWallet: string,
  quantity: number,
): Promise<string> {
  const transaction = prepareContractCall({
    contract: getContractByAddress(erc20TokenAddress),
    method: 'function transfer(address to, uint256 amount) returns (bool)',
    params: [toWallet, BigInt(quantity)],
  });
  const receipt = await sendAndConfirmTransaction({ transaction, account });
  return receipt.transactionHash;
}

/** A short, user-readable message from a thrown chain error. */
export function chainErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    const message = error.message.split('\n')[0];
    return message.length > 240 ? `${message.slice(0, 240)}...` : message;
  }
  return 'The transaction failed on chain';
}
