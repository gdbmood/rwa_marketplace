/**
 * Playwright test fixtures for the rwa_marketplace e2e suite.
 *
 * Usage in specs:
 *
 *   import { expect, test } from '../fixtures';
 *
 *   test('investor buys fractions', async ({ page, loginAs, chain, db }) => {
 *     await loginAs(page, 'investor1');
 *     ...
 *     await chain.mineBlock();
 *     const user = await db().userByWallet(walletAddress);
 *   });
 *
 * Fixtures:
 *   walletFor(name)          deterministic funded hardhat wallet per role,
 *                            read from e2e/.chain.json and cross-checked
 *                            against e2e/wallets.ts (the roster seed.ts uses)
 *   loginAs(page, name, t?)  seeds localStorage e2e_pk (the key
 *                            src/lib/wallet/testAccount.ts reads) and issues
 *                            the production-equivalent session cookie via
 *                            POST /api/test-auth
 *   sumsubApprove(req, w)    posts a correctly HMAC-signed Sumsub GREEN
 *                            webhook for the wallet, flipping is_verified
 *   chain                    raw JSON-RPC plus mineBlock / increaseTime
 *   db()                     service-role Supabase client for assertions;
 *                            throws a clear message while the key is a
 *                            placeholder
 */

// Loads .env.local / .env (SUMSUB_WEBHOOK_SECRET, Supabase creds) and stubs
// the server-only marker so src/ imports stay possible from node.
import '../scripts/lib/bootstrap';

import { createHmac } from 'node:crypto';
import {
  test as base,
  expect,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../src/types/database';
import {
  CHAIN_RPC_URL,
  readChainJson,
  rpcCall,
  type ChainJson,
} from './stack';
import {
  DEFAULT_USER_TYPE,
  HARDHAT_ACCOUNT_INDEX,
  WALLETS,
  type WalletRole,
} from './wallets';

export type { WalletRole } from './wallets';

/** localStorage key src/lib/wallet/testAccount.ts reads in test mode. */
const E2E_PK_STORAGE_KEY = 'e2e_pk';

export interface TestWallet {
  role: WalletRole;
  address: string;
  privateKey: string;
}

// -- wallet roster -----------------------------------------------------------

let cachedChain: ChainJson | null = null;

function chainJson(): ChainJson {
  if (!cachedChain) {
    const parsed = readChainJson();
    if (!parsed) {
      throw new Error(
        'e2e/.chain.json is missing. Global setup writes it; run the suite through `npm run e2e` ' +
          'instead of invoking specs against a bare app.',
      );
    }
    cachedChain = parsed;
  }
  return cachedChain;
}

function resolveWallet(role: WalletRole): TestWallet {
  const index = HARDHAT_ACCOUNT_INDEX[role];
  const account = chainJson().accounts[index];
  if (!account) {
    throw new Error(
      `e2e/.chain.json has no funded account at index ${index} for "${role}". ` +
        'Delete e2e/.chain.json and rerun so the deploy funds all accounts.',
    );
  }
  if (account.address.toLowerCase() !== WALLETS[role].toLowerCase()) {
    throw new Error(
      `Wallet mismatch for "${role}": seed roster (e2e/wallets.ts) says ${WALLETS[role]} ` +
        `but e2e/.chain.json account ${index} is ${account.address}.`,
    );
  }
  return { role, address: account.address, privateKey: account.privateKey };
}

// -- auth --------------------------------------------------------------------

async function performLogin(
  page: Page,
  role: WalletRole,
  type?: 'retail' | 'business',
): Promise<TestWallet> {
  const wallet = resolveWallet(role);
  const userType = type ?? DEFAULT_USER_TYPE[role];

  // Present on every navigation from now on, so the app's test-mode signer
  // (src/lib/wallet/testAccount.ts) finds the key whenever a page loads.
  await page.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // about:blank and similar origins have no storage; the init script
        // reruns on every real navigation.
      }
    },
    [E2E_PK_STORAGE_KEY, wallet.privateKey] as const,
  );

  // Shares the cookie jar with the page's browser context, so the session
  // cookie set by the route applies to subsequent page navigations.
  const response = await page.context().request.post('/api/test-auth', {
    data: { wallet: wallet.address, type: userType },
  });
  if (!response.ok()) {
    const body = await response.text();
    throw new Error(
      `POST /api/test-auth failed (${response.status()}): ${body}. ` +
        'Is the app running with TEST_MODE=1?',
    );
  }
  return wallet;
}

// -- sumsub ------------------------------------------------------------------

async function postSumsubWebhook(
  request: APIRequestContext,
  wallet: string,
  reviewAnswer: 'GREEN' | 'RED',
): Promise<void> {
  const secret = process.env.SUMSUB_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error(
      'SUMSUB_WEBHOOK_SECRET is not set. The app and this fixture must share the value from .env.local.',
    );
  }
  const payload = {
    type: 'applicantReviewed',
    externalUserId: wallet,
    applicantId: `e2e-applicant-${wallet.toLowerCase()}`,
    levelName: 'id-and-liveness',
    reviewResult: { reviewAnswer },
  };
  const rawBody = JSON.stringify(payload);
  const digest = createHmac('sha256', secret).update(rawBody).digest('hex');
  const response = await request.post('/api/sumsub-webhook', {
    headers: {
      'Content-Type': 'application/json',
      'x-payload-digest': digest,
      'x-payload-digest-alg': 'HMAC_SHA256_HEX',
    },
    data: rawBody,
  });
  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`POST /api/sumsub-webhook failed (${response.status()}): ${body}`);
  }
}

// -- chain helpers -----------------------------------------------------------

export interface ChainHelpers {
  rpcUrl: string;
  /** Raw JSON-RPC call against the local hardhat node. */
  rpc<T>(method: string, params?: unknown[]): Promise<T>;
  /** Mines one or more blocks immediately. */
  mineBlock(count?: number): Promise<void>;
  /** Advances chain time by the given seconds, then mines a block. */
  increaseTime(seconds: number): Promise<void>;
}

const chainHelpers: ChainHelpers = {
  rpcUrl: CHAIN_RPC_URL,
  rpc: (method, params = []) => rpcCall(method, params),
  async mineBlock(count = 1) {
    for (let i = 0; i < count; i += 1) {
      await rpcCall('evm_mine');
    }
  },
  async increaseTime(seconds) {
    await rpcCall('evm_increaseTime', [seconds]);
    await rpcCall('evm_mine');
  },
};

// -- database ----------------------------------------------------------------

export type ServiceDb = SupabaseClient<Database> & {
  /** Users row for a wallet (addresses are stored lowercased), or null. */
  userByWallet(
    wallet: string,
  ): Promise<Database['public']['Tables']['users']['Row'] | null>;
};

let cachedDb: ServiceDb | null = null;

function serviceDb(): ServiceDb {
  if (cachedDb) {
    return cachedDb;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set; check .env.local.');
  }
  if (!key || key === 'placeholder') {
    throw new Error(
      'SKIP: SUPABASE_SERVICE_ROLE_KEY is missing or still "placeholder" in .env.local, ' +
        'so database assertions cannot run. Set the real service role key first.',
    );
  }
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }) as ServiceDb;
  client.userByWallet = async (wallet: string) => {
    const { data, error } = await client
      .from('users')
      .select('*')
      .eq('wallet_address', wallet.toLowerCase())
      .maybeSingle();
    if (error) {
      throw new Error(`db.userByWallet(${wallet}) failed: ${error.message}`);
    }
    return data;
  };
  cachedDb = client;
  return client;
}

// -- fixture wiring ----------------------------------------------------------

export interface E2EFixtures {
  /** Deterministic funded hardhat wallet for a seeded role. */
  walletFor: (name: WalletRole) => TestWallet;
  /**
   * Seeds localStorage e2e_pk and issues the session cookie via
   * /api/test-auth. Type defaults per role (business roles log in as
   * business). Returns the wallet used.
   */
  loginAs: (
    page: Page,
    name: WalletRole,
    type?: 'retail' | 'business',
  ) => Promise<TestWallet>;
  /** Posts a signed Sumsub webhook for the wallet. Defaults to GREEN. */
  sumsubApprove: (
    request: APIRequestContext,
    wallet: string,
    reviewAnswer?: 'GREEN' | 'RED',
  ) => Promise<void>;
  /** Hardhat JSON-RPC helpers (mine a block, advance time). */
  chain: ChainHelpers;
  /** Lazy service-role Supabase client; throws while the key is a placeholder. */
  db: () => ServiceDb;
}

export const test = base.extend<E2EFixtures>({
  walletFor: async ({}, use) => {
    await use(resolveWallet);
  },
  loginAs: async ({}, use) => {
    await use(performLogin);
  },
  sumsubApprove: async ({}, use) => {
    await use((request, wallet, reviewAnswer = 'GREEN') =>
      postSumsubWebhook(request, wallet, reviewAnswer),
    );
  },
  chain: async ({}, use) => {
    await use(chainHelpers);
  },
  db: async ({}, use) => {
    await use(serviceDb);
  },
});

export { expect };
