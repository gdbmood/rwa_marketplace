/**
 * Node-side chain actors for the e2e suite.
 *
 * Playwright drives the BROWSER wallet through src/lib/wallet/testAccount.ts,
 * but some journey preconditions have to happen outside the app UI (the
 * investor journeys need an asset that is genuinely live on the local chain,
 * minted by a business wallet). This module signs those transactions from the
 * test process with the same thirdweb v5 stack the app itself uses, against
 * the local hardhat RPC, so nothing here needs thirdweb API credentials.
 *
 * Addresses come from e2e/.chain.json (written by
 * contracts/scripts/deploy_local.ts); the chain definition mirrors
 * src/lib/thirdWebClient.ts for chain id 31337.
 */

import '../../scripts/lib/bootstrap';

import {
  createThirdwebClient,
  defineChain,
  getContract,
  prepareContractCall,
  sendAndConfirmTransaction,
  type Chain,
  type ThirdwebClient,
} from 'thirdweb';
import { privateKeyToAccount, type Account } from 'thirdweb/wallets';
import { createListing as mintAndFractionalizeAbi } from '../../src/utils/ABI';
import { toMicroUsdc } from '../../src/actions/quote';
import { CHAIN_ID, CHAIN_RPC_URL, readChainJson, type ChainJson } from '../stack';

let cachedClient: ThirdwebClient | null = null;
let cachedChain: Chain | null = null;
let cachedChainJson: ChainJson | null = null;

function chainJson(): ChainJson {
  if (!cachedChainJson) {
    const parsed = readChainJson();
    if (!parsed) {
      throw new Error(
        'e2e/.chain.json is missing. Run the suite through `npm run e2e` so the deploy script writes it.',
      );
    }
    if (parsed.chainId !== CHAIN_ID) {
      throw new Error(
        `e2e/.chain.json is for chain ${parsed.chainId}, expected ${CHAIN_ID}. Delete it and rerun.`,
      );
    }
    cachedChainJson = parsed;
  }
  return cachedChainJson;
}

function client(): ThirdwebClient {
  if (!cachedClient) {
    // The clientId is never used for local RPC traffic; any value satisfies
    // the constructor. Reuse the app's id when the env has one.
    cachedClient = createThirdwebClient({
      clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || 'e2e-local-client',
    });
  }
  return cachedClient;
}

function chain(): Chain {
  if (!cachedChain) {
    cachedChain = defineChain({
      id: CHAIN_ID,
      name: 'Hardhat',
      rpc: CHAIN_RPC_URL,
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      testnet: true,
    });
  }
  return cachedChain;
}

function accountFor(privateKey: string): Account {
  return privateKeyToAccount({ client: client(), privateKey });
}

/** The deployed marketplace proxy address (from e2e/.chain.json). */
export function marketplaceAddress(): string {
  return chainJson().marketplace;
}

/**
 * mintAndFractionalizeNFT(totalSupply, pricePerFraction, metadata) signed by
 * the given wallet key. The metadata string should carry a per-run unique
 * value: identical calldata from an identical nonce would reproduce an
 * earlier run's transaction hash on a fresh chain, and the ingest table
 * dedupes events on (chain_id, tx_hash, log_index).
 * Returns the transaction hash.
 */
export async function mintAndFractionalizeOnChain(
  privateKey: string,
  input: { totalSupply: number; priceUsdc: string; metadata: string },
): Promise<string> {
  const transaction = prepareContractCall({
    contract: getContract({ client: client(), chain: chain(), address: marketplaceAddress() }),
    method: mintAndFractionalizeAbi,
    params: [
      BigInt(input.totalSupply),
      toMicroUsdc(input.priceUsdc),
      input.metadata,
    ],
  });
  const receipt = await sendAndConfirmTransaction({
    transaction,
    account: accountFor(privateKey),
  });
  return receipt.transactionHash;
}

/**
 * ERC20 approve(marketplace, quantity) on a fraction token. The marketplace
 * contract pulls fractions from the seller with transferFrom on every buy,
 * and mintAndFractionalizeNFT does NOT set this allowance, so the minting
 * business must grant it before its auto-created primary listing is buyable.
 * Returns the transaction hash.
 */
export async function approveFractionsForMarketplace(
  privateKey: string,
  erc20TokenAddress: string,
  quantity: number,
): Promise<string> {
  const transaction = prepareContractCall({
    contract: getContract({ client: client(), chain: chain(), address: erc20TokenAddress }),
    method: 'function approve(address spender, uint256 amount) returns (bool)',
    params: [marketplaceAddress(), BigInt(quantity)],
  });
  const receipt = await sendAndConfirmTransaction({
    transaction,
    account: accountFor(privateKey),
  });
  return receipt.transactionHash;
}
