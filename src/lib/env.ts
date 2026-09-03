/**
 * Typed environment accessors. All getters are lazy so that a missing var
 * fails at first use with a clear message instead of crashing at import time.
 *
 * NEXT_PUBLIC_* vars are read through literal `process.env.NEXT_PUBLIC_X`
 * expressions so Next.js can inline them into client bundles.
 */

export type PublicEnvName =
  | 'NEXT_PUBLIC_SUPABASE_URL'
  | 'NEXT_PUBLIC_SUPABASE_ANON_KEY'
  | 'NEXT_PUBLIC_THIRDWEB_CLIENT_ID'
  | 'NEXT_PUBLIC_THIRDWEB_CHAIN_ID'
  | 'NEXT_PUBLIC_THIRDWEB_CONTRACT_ADDRESS'
  | 'NEXT_PUBLIC_USDC_CONTRACT_ADDRESS'
  | 'NEXT_PUBLIC_BLOCKCHAIN_EXPLORER_URL'
  | 'NEXT_PUBLIC_THIRDWEB_AUTH_DOMAIN';

export type ServerEnvName =
  | 'SUPABASE_SERVICE_ROLE_KEY'
  | 'SUPABASE_JWT_SECRET'
  | 'THIRDWEB_SECRET_KEY'
  | 'AUTH_PRIVATE_KEY'
  | 'SUMSUB_TOKEN'
  | 'SUMSUB_SECRET_KEY'
  | 'SUMSUB_WEBHOOK_SECRET'
  | 'INDEXER_RPC_URL'
  | 'CHAIN_WEBHOOK_SECRET'
  | 'EXCHANGE_RATE_API_KEY'
  | 'THIRDWEB_WEBHOOK_SECRET';

// Literal member accesses are required for Next.js build-time inlining.
const publicReaders: Record<PublicEnvName, () => string | undefined> = {
  NEXT_PUBLIC_SUPABASE_URL: () => process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_THIRDWEB_CLIENT_ID: () => process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID,
  NEXT_PUBLIC_THIRDWEB_CHAIN_ID: () => process.env.NEXT_PUBLIC_THIRDWEB_CHAIN_ID,
  NEXT_PUBLIC_THIRDWEB_CONTRACT_ADDRESS: () =>
    process.env.NEXT_PUBLIC_THIRDWEB_CONTRACT_ADDRESS,
  NEXT_PUBLIC_USDC_CONTRACT_ADDRESS: () => process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS,
  NEXT_PUBLIC_BLOCKCHAIN_EXPLORER_URL: () => process.env.NEXT_PUBLIC_BLOCKCHAIN_EXPLORER_URL,
  NEXT_PUBLIC_THIRDWEB_AUTH_DOMAIN: () => process.env.NEXT_PUBLIC_THIRDWEB_AUTH_DOMAIN,
};

export class MissingEnvError extends Error {
  constructor(name: string) {
    super(`Missing required environment variable: ${name}. Add it to your .env file (see .env.example).`);
    this.name = 'MissingEnvError';
  }
}

export function requirePublicEnv(name: PublicEnvName): string {
  const value = publicReaders[name]();
  if (!value) {
    throw new MissingEnvError(name);
  }
  return value;
}

export function requireServerEnv(name: ServerEnvName): string {
  const value = process.env[name];
  if (!value) {
    throw new MissingEnvError(name);
  }
  return value;
}

/** Lazy getters for public (browser-safe) configuration. */
export const publicEnv = {
  get supabaseUrl(): string {
    return requirePublicEnv('NEXT_PUBLIC_SUPABASE_URL');
  },
  get supabaseAnonKey(): string {
    return requirePublicEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  },
  get thirdwebClientId(): string {
    return requirePublicEnv('NEXT_PUBLIC_THIRDWEB_CLIENT_ID');
  },
  get thirdwebChainId(): number {
    const raw = requirePublicEnv('NEXT_PUBLIC_THIRDWEB_CHAIN_ID');
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
      throw new Error(`NEXT_PUBLIC_THIRDWEB_CHAIN_ID must be an integer, got "${raw}"`);
    }
    return parsed;
  },
  get thirdwebContractAddress(): string {
    return requirePublicEnv('NEXT_PUBLIC_THIRDWEB_CONTRACT_ADDRESS');
  },
  get usdcContractAddress(): string {
    return requirePublicEnv('NEXT_PUBLIC_USDC_CONTRACT_ADDRESS');
  },
  get blockchainExplorerUrl(): string {
    return requirePublicEnv('NEXT_PUBLIC_BLOCKCHAIN_EXPLORER_URL');
  },
  get thirdwebAuthDomain(): string {
    return requirePublicEnv('NEXT_PUBLIC_THIRDWEB_AUTH_DOMAIN');
  },
};

/** Lazy getters for server-only secrets. Never import from client components. */
export const serverEnv = {
  get supabaseServiceRoleKey(): string {
    return requireServerEnv('SUPABASE_SERVICE_ROLE_KEY');
  },
  get supabaseJwtSecret(): string {
    return requireServerEnv('SUPABASE_JWT_SECRET');
  },
  get thirdwebSecretKey(): string {
    return requireServerEnv('THIRDWEB_SECRET_KEY');
  },
  get authPrivateKey(): string {
    return requireServerEnv('AUTH_PRIVATE_KEY');
  },
  get sumsubToken(): string {
    return requireServerEnv('SUMSUB_TOKEN');
  },
  get sumsubSecretKey(): string {
    return requireServerEnv('SUMSUB_SECRET_KEY');
  },
  get sumsubWebhookSecret(): string {
    return requireServerEnv('SUMSUB_WEBHOOK_SECRET');
  },
  get indexerRpcUrl(): string {
    return requireServerEnv('INDEXER_RPC_URL');
  },
  get chainWebhookSecret(): string {
    return requireServerEnv('CHAIN_WEBHOOK_SECRET');
  },
  get exchangeRateApiKey(): string {
    return requireServerEnv('EXCHANGE_RATE_API_KEY');
  },
  get thirdwebWebhookSecret(): string {
    return requireServerEnv('THIRDWEB_WEBHOOK_SECRET');
  },
};
