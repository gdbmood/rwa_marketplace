/**
 * Deployed contract addresses per chain.
 *
 * Sources: contracts/.openzeppelin/base-sepolia.json, contracts/.openzeppelin/base.json,
 * contracts/README.md and the contracts audit (docs/audit/contracts.md).
 *
 * The Marketplace is an OpenZeppelin transparent proxy. Two generations exist on
 * Base Sepolia: the README proxy (0x7FfF31...) predates the fee collector rewrite and
 * returns an 8 field NFTDetails tuple (includes assetClass), which the current ABI in
 * src/utils/ABI.ts cannot decode. Only the addresses below marked as current layout
 * are compatible with this codebase.
 */

export interface ChainContracts {
  chainId: number;
  name: string;
  /** Marketplace transparent proxy, current storage layout (fee collector, 7 field tuple). */
  marketplace: `0x${string}`;
  /** USDC token used for settlement (6 decimals). */
  usdc: `0x${string}`;
  explorerUrl: string;
}

export const BASE_MAINNET: ChainContracts = {
  chainId: 8453,
  name: "Base",
  marketplace: "0x511B10f9fD7d95738E372757EF85FB8a0c290f0E",
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  explorerUrl: "https://basescan.org",
};

export const BASE_SEPOLIA: ChainContracts = {
  chainId: 84532,
  name: "Base Sepolia",
  marketplace: "0x27De872d3E546Db2157e516C10d9C7bDBed03Aa3",
  usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  explorerUrl: "https://sepolia.basescan.org",
};

/** Local hardhat node used by the e2e suite; addresses are written by the deploy script. */
export const LOCAL_HARDHAT: ChainContracts = {
  chainId: 31337,
  name: "Hardhat",
  marketplace: (process.env.NEXT_PUBLIC_LOCAL_MARKETPLACE_ADDRESS ??
    "0x0000000000000000000000000000000000000000") as `0x${string}`,
  usdc: (process.env.NEXT_PUBLIC_LOCAL_USDC_ADDRESS ??
    "0x0000000000000000000000000000000000000000") as `0x${string}`,
  explorerUrl: "http://localhost:8545",
};

export const CONTRACTS_BY_CHAIN: Record<number, ChainContracts> = {
  [BASE_MAINNET.chainId]: BASE_MAINNET,
  [BASE_SEPOLIA.chainId]: BASE_SEPOLIA,
  [LOCAL_HARDHAT.chainId]: LOCAL_HARDHAT,
};

/**
 * Historical addresses kept for reference and for the chain reconciliation script.
 * Do not point the app at these.
 */
export const LEGACY_DEPLOYMENTS = {
  baseSepolia: {
    /** README era proxy, pre fee collector layout (8 field tuple with assetClass). */
    marketplaceProxyV1: "0x7FfF316219A036C084F0e84c251c5276e0A6f861",
    oldImplementations: [
      "0x6Dc226918B9460cea5758A07E01d5735B3eF4CEA",
      "0xE5D7a37f07b780fD55989B296399f2478c8dD5ED",
    ],
    currentImplementation: "0x651D1c4D4Ae3e9E7E4400875C1F8703e2d4db8D1",
  },
  baseMainnet: {
    currentImplementation: "0xADC240E97970B1C0c9AB87F80E60AbC6af30D536",
  },
} as const;

export function getContracts(chainId: number): ChainContracts {
  const c = CONTRACTS_BY_CHAIN[chainId];
  if (!c) throw new Error(`No contract config for chain id ${chainId}`);
  return c;
}
