import 'server-only';

import {
  createThirdwebClient,
  defineChain,
  getContract,
  prepareEvent,
  readContract,
  type ThirdwebClient,
  type ThirdwebContract,
} from 'thirdweb';
import type { Chain } from 'thirdweb/chains';
import {
  eth_blockNumber,
  eth_getLogs,
  eth_getTransactionByHash,
  eth_getTransactionReceipt,
  getRpcClient,
} from 'thirdweb/rpc';
import type { Json } from '@/types/database';
import { publicEnv } from '@/lib/env';
import type { TransferLogRecord } from '@/lib/indexer/core';

/**
 * Chain access for the indexer. All log fetching goes through eth_getLogs on
 * the configured RPC (INDEXER_RPC_URL overrides the thirdweb default RPC for
 * the chain), and all decoding is done locally against the four event layouts
 * the indexer cares about, so the same decoder serves the polling ingest, the
 * webhook route and the receipt fallback.
 */

type RpcRequest = ReturnType<typeof getRpcClient>;

export interface IndexerChainContext {
  client: ThirdwebClient;
  chain: Chain;
  chainId: number;
  marketplaceAddress: string;
  contract: ThirdwebContract;
  rpc: RpcRequest;
}

export interface ChainContextOverrides {
  chainId?: number;
  rpcUrl?: string;
  marketplaceAddress?: string;
}

export function createIndexerChainContext(
  overrides: ChainContextOverrides = {},
): IndexerChainContext {
  const chainId = overrides.chainId ?? publicEnv.thirdwebChainId;
  const rpcUrl = overrides.rpcUrl ?? process.env.INDEXER_RPC_URL ?? undefined;
  const secretKey = process.env.THIRDWEB_SECRET_KEY;
  const client = createThirdwebClient(
    secretKey ? { secretKey } : { clientId: publicEnv.thirdwebClientId },
  );
  const chain = rpcUrl ? defineChain({ id: chainId, rpc: rpcUrl }) : defineChain(chainId);
  const marketplaceAddress = (
    overrides.marketplaceAddress ?? publicEnv.thirdwebContractAddress
  ).toLowerCase();
  const contract = getContract({ client, chain, address: marketplaceAddress });
  const rpc = getRpcClient({ client, chain });
  return { client, chain, chainId, marketplaceAddress, contract, rpc };
}

// Event topic hashes, computed from the contract signatures so there is no
// hardcoded-constant drift (see docs/audit/contracts.md section 4).

const nftFractionalizedEvent = prepareEvent({
  signature:
    'event NFTFractionalized(uint256 indexed nftId, address erc20TokenAddress, uint256 totalSupply, uint256 pricePerFraction)',
});
const fractionBoughtEvent = prepareEvent({
  signature:
    'event FractionBought(address indexed buyer, address indexed erc20Token, uint256 amount, uint256 pricePaid)',
});
const royaltyDistributedEvent = prepareEvent({
  signature: 'event RoyaltyDistributed(address indexed erc20Token, uint256 amount, uint256 timestamp)',
});
const transferEvent = prepareEvent({
  signature: 'event Transfer(address indexed from, address indexed to, uint256 value)',
});

export const NFT_FRACTIONALIZED_TOPIC = nftFractionalizedEvent.hash;
export const FRACTION_BOUGHT_TOPIC = fractionBoughtEvent.hash;
export const ROYALTY_DISTRIBUTED_TOPIC = royaltyDistributedEvent.hash;
export const TRANSFER_TOPIC = transferEvent.hash;

// Local hex decoding helpers (all four events use static-width fields only).

function stripHex(value: string): string {
  return value.startsWith('0x') ? value.slice(2) : value;
}

function dataWord(data: string, index: number): string {
  const body = stripHex(data);
  const start = index * 64;
  const word = body.slice(start, start + 64);
  if (word.length !== 64) {
    return '';
  }
  return word;
}

function wordToBigIntString(word: string): string | null {
  if (word.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(word)) {
    return null;
  }
  return BigInt(`0x${word}`).toString();
}

function wordToAddress(word: string): string | null {
  if (word.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(word)) {
    return null;
  }
  return `0x${word.slice(24).toLowerCase()}`;
}

function topicToAddress(topics: readonly string[], index: number): string | null {
  const topic = topics[index];
  if (typeof topic !== 'string') {
    return null;
  }
  return wordToAddress(stripHex(topic));
}

function topicToBigIntString(topics: readonly string[], index: number): string | null {
  const topic = topics[index];
  if (typeof topic !== 'string') {
    return null;
  }
  return wordToBigIntString(stripHex(topic));
}

export interface DecodedKnownLog {
  eventName: 'NFTFractionalized' | 'FractionBought' | 'RoyaltyDistributed' | 'Transfer';
  args: Record<string, string>;
}

/**
 * Decodes one raw log against the four known event layouts. Returns null for
 * unknown topics or malformed payloads so callers can skip noise (for example
 * Initialized or OwnershipTransferred on the marketplace).
 */
export function decodeKnownLog(
  topics: readonly string[],
  data: string,
): DecodedKnownLog | null {
  const topic0 = typeof topics[0] === 'string' ? topics[0].toLowerCase() : null;
  if (!topic0) {
    return null;
  }

  if (topic0 === NFT_FRACTIONALIZED_TOPIC.toLowerCase()) {
    const nftId = topicToBigIntString(topics, 1);
    const erc20TokenAddress = wordToAddress(dataWord(data, 0));
    const totalSupply = wordToBigIntString(dataWord(data, 1));
    const pricePerFraction = wordToBigIntString(dataWord(data, 2));
    if (nftId === null || erc20TokenAddress === null || totalSupply === null || pricePerFraction === null) {
      return null;
    }
    return {
      eventName: 'NFTFractionalized',
      args: { nftId, erc20TokenAddress, totalSupply, pricePerFraction },
    };
  }

  if (topic0 === FRACTION_BOUGHT_TOPIC.toLowerCase()) {
    const buyer = topicToAddress(topics, 1);
    const erc20Token = topicToAddress(topics, 2);
    const amount = wordToBigIntString(dataWord(data, 0));
    const pricePaid = wordToBigIntString(dataWord(data, 1));
    if (buyer === null || erc20Token === null || amount === null || pricePaid === null) {
      return null;
    }
    return { eventName: 'FractionBought', args: { buyer, erc20Token, amount, pricePaid } };
  }

  if (topic0 === ROYALTY_DISTRIBUTED_TOPIC.toLowerCase()) {
    const erc20Token = topicToAddress(topics, 1);
    const amount = wordToBigIntString(dataWord(data, 0));
    const timestamp = wordToBigIntString(dataWord(data, 1));
    if (erc20Token === null || amount === null || timestamp === null) {
      return null;
    }
    return { eventName: 'RoyaltyDistributed', args: { erc20Token, amount, timestamp } };
  }

  if (topic0 === TRANSFER_TOPIC.toLowerCase()) {
    const from = topicToAddress(topics, 1);
    const to = topicToAddress(topics, 2);
    const value = wordToBigIntString(dataWord(data, 0));
    if (from === null || to === null || value === null) {
      return null;
    }
    return { eventName: 'Transfer', args: { from, to, value } };
  }

  return null;
}

export interface NormalizedChainLog {
  chainId: number;
  contractAddress: string;
  eventName: string;
  txHash: string;
  blockNumber: number;
  logIndex: number;
  args: Json;
}

interface RawLogLike {
  address: string;
  topics: readonly string[];
  data: string;
  blockNumber: bigint | null;
  transactionHash: string | null;
  logIndex: number | null;
}

function normalizeLog(chainId: number, log: RawLogLike): NormalizedChainLog | null {
  if (log.blockNumber === null || log.transactionHash === null || log.logIndex === null) {
    return null; // pending log, wait for inclusion
  }
  const decoded = decodeKnownLog(log.topics, log.data);
  if (!decoded) {
    return null;
  }
  return {
    chainId,
    contractAddress: log.address.toLowerCase(),
    eventName: decoded.eventName,
    txHash: log.transactionHash,
    blockNumber: Number(log.blockNumber),
    logIndex: log.logIndex,
    args: decoded.args,
  };
}

async function fetchLogs(
  ctx: IndexerChainContext,
  address: string,
  fromBlock: number,
  toBlock: number,
  topics?: string[],
): Promise<NormalizedChainLog[]> {
  // thirdweb's eth_getLogs drops a falsy fromBlock, which would default the
  // node to "latest"; block 0 (genesis) carries no logs, so clamp to 1.
  const logs = await eth_getLogs(ctx.rpc, {
    address: address as `0x${string}`,
    fromBlock: BigInt(Math.max(fromBlock, 1)),
    toBlock: BigInt(Math.max(toBlock, 1)),
    ...(topics ? { topics: topics as `0x${string}`[] } : {}),
  });
  const normalized: NormalizedChainLog[] = [];
  for (const log of logs) {
    const entry = normalizeLog(ctx.chainId, log);
    if (entry) {
      normalized.push(entry);
    }
  }
  return normalized;
}

/** All marketplace events (mint, buy, royalty) in the block range, inclusive. */
export async function fetchMarketplaceLogs(
  ctx: IndexerChainContext,
  fromBlock: number,
  toBlock: number,
): Promise<NormalizedChainLog[]> {
  return fetchLogs(ctx, ctx.marketplaceAddress, fromBlock, toBlock);
}

/** ERC20 Transfer logs for each known fraction token in the range, inclusive. */
export async function fetchTransferLogs(
  ctx: IndexerChainContext,
  tokenAddresses: string[],
  fromBlock: number,
  toBlock: number,
): Promise<NormalizedChainLog[]> {
  const all: NormalizedChainLog[] = [];
  for (const token of tokenAddresses) {
    const logs = await fetchLogs(ctx, token, fromBlock, toBlock, [TRANSFER_TOPIC]);
    all.push(...logs);
  }
  return all;
}

export async function getLatestBlock(ctx: IndexerChainContext): Promise<number> {
  const block = await eth_blockNumber(ctx.rpc);
  return Number(block);
}

/** Lowercased sender of a transaction, or null when it cannot be fetched. */
export async function getTxSender(
  ctx: IndexerChainContext,
  txHash: string,
): Promise<string | null> {
  try {
    const tx = await eth_getTransactionByHash(ctx.rpc, { hash: txHash as `0x${string}` });
    return tx.from ? tx.from.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Fallback for buy settlement when Transfer logs were not ingested (for
 * example a webhook that only delivered the FractionBought event): reads the
 * receipt and decodes the fraction token's Transfer logs directly.
 */
export async function getTransferLogsFromReceipt(
  ctx: IndexerChainContext,
  txHash: string,
  tokenAddress: string,
): Promise<TransferLogRecord[]> {
  try {
    const receipt = await eth_getTransactionReceipt(ctx.rpc, { hash: txHash as `0x${string}` });
    const token = tokenAddress.toLowerCase();
    const records: TransferLogRecord[] = [];
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== token) {
        continue;
      }
      const decoded = decodeKnownLog(log.topics, log.data);
      if (!decoded || decoded.eventName !== 'Transfer') {
        continue;
      }
      records.push({
        from: decoded.args.from,
        to: decoded.args.to,
        value: BigInt(decoded.args.value),
        logIndex: log.logIndex,
      });
    }
    return records;
  } catch {
    return [];
  }
}

export interface ChainListing {
  nftOwner: string;
  nftId: number;
  totalSupply: bigint;
  pricePerFractionMicro: bigint;
  erc20TokenAddress: string;
  isFractionalized: boolean;
}

/** Reads fetchAllListings, the only on-chain view into primary listing state. */
export async function fetchAllListingsOnChain(
  ctx: IndexerChainContext,
): Promise<ChainListing[]> {
  const listings = await readContract({
    contract: ctx.contract,
    method:
      'function fetchAllListings() view returns ((address nftOwner, uint256 nftId, string metadata, uint256 totalSupply, uint256 pricePerFraction, address erc20TokenAddress, bool isFractionalized)[])',
    params: [],
  });
  return listings.map((entry) => ({
    nftOwner: entry.nftOwner.toLowerCase(),
    nftId: Number(entry.nftId),
    totalSupply: entry.totalSupply,
    pricePerFractionMicro: entry.pricePerFraction,
    erc20TokenAddress: entry.erc20TokenAddress.toLowerCase(),
    isFractionalized: entry.isFractionalized,
  }));
}

/** balanceOf(wallet) on a fraction token, as a bigint fraction count. */
export async function balanceOfOnChain(
  ctx: IndexerChainContext,
  tokenAddress: string,
  wallet: string,
): Promise<bigint> {
  const tokenContract = getContract({ client: ctx.client, chain: ctx.chain, address: tokenAddress });
  return readContract({
    contract: tokenContract,
    method: 'function balanceOf(address account) view returns (uint256)',
    params: [wallet as `0x${string}`],
  });
}
