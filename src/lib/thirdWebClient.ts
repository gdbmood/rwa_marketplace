import { createThirdwebClient, defineChain, getContract, type Chain } from "thirdweb";
import { getContracts } from "@/config/contracts";

/**
 * Shared thirdweb client and contract handles.
 *
 * Chain resolution goes through src/config/contracts.ts keyed by
 * NEXT_PUBLIC_THIRDWEB_CHAIN_ID, including the 31337 local hardhat chain used
 * by the e2e suite (custom RPC at http://127.0.0.1:8545). Contract addresses
 * come from the env vars when set and fall back to the per chain config, so
 * local runs only need the chain id plus the addresses the deploy script
 * writes into NEXT_PUBLIC_LOCAL_* (read by src/config/contracts.ts).
 */

const clientId = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID!; // used on the client
const secretKey = process.env.THIRDWEB_SECRET_KEY!; // used on the server side

export const client = createThirdwebClient(
    secretKey ? { secretKey } : { clientId },
);

const LOCAL_CHAIN_ID = 31337;
const LOCAL_RPC_URL = "http://127.0.0.1:8545";

function resolveChainId(): number {
    const raw = process.env.NEXT_PUBLIC_THIRDWEB_CHAIN_ID;
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    if (Number.isNaN(parsed)) {
        throw new Error(
            `NEXT_PUBLIC_THIRDWEB_CHAIN_ID must be an integer chain id, got "${raw}"`,
        );
    }
    return parsed;
}

/** Chain id the app is configured for (8453, 84532 or 31337 locally). */
export const activeChainId = resolveChainId();

function resolveChain(chainId: number): Chain {
    if (chainId === LOCAL_CHAIN_ID) {
        // The public chain registry knows nothing about a local hardhat node,
        // so the RPC must be pinned explicitly.
        return defineChain({
            id: LOCAL_CHAIN_ID,
            name: "Hardhat",
            rpc: LOCAL_RPC_URL,
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            testnet: true,
        });
    }
    return defineChain(chainId);
}

/** The chain every wallet connection and contract call targets. */
export const chain: Chain = resolveChain(activeChainId);

function resolveMarketplaceAddress(chainId: number): string {
    const fromEnv = process.env.NEXT_PUBLIC_THIRDWEB_CONTRACT_ADDRESS;
    if (fromEnv) {
        return fromEnv;
    }
    return getContracts(chainId).marketplace;
}

function resolveUsdcAddress(chainId: number): string {
    const fromEnv = process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS;
    if (fromEnv) {
        return fromEnv;
    }
    return getContracts(chainId).usdc;
}

/** Marketplace proxy address for the active chain (env first, then config). */
export const marketplaceAddress = resolveMarketplaceAddress(activeChainId);

/** USDC token address for the active chain (env first, then config). */
export const usdcAddress = resolveUsdcAddress(activeChainId);

/** The Marketplace contract on the active chain. */
export const contract = getContract({
    client,
    chain,
    address: marketplaceAddress,
});

/** The USDC settlement token contract on the active chain. */
export const usdcContract = getContract({
    client,
    chain,
    address: usdcAddress,
});

/** Any other contract (e.g. a fraction ERC20) on the active chain. */
export const getContractByAddress = (address: string) => getContract({
    client,
    chain,
    address,
});
