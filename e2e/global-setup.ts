/**
 * Playwright global setup. Runs AFTER the webServer command (e2e/start-web.ts)
 * has brought the app up - Playwright starts webServer plugins before global
 * setup - so by the time this executes the hardhat node, contracts and
 * e2e/.env.chain normally exist already. The ensureChainStack() call below is
 * an idempotent re-check that also covers the reuseExistingServer path where
 * start-web.ts never ran.
 *
 * Responsibilities:
 *   - fail fast with a readable error when required env is missing (the
 *     remote Supabase service role key in particular),
 *   - ensure the chain stack (hardhat node on 8545, deployed contracts,
 *     e2e/.chain.json, e2e/.env.chain),
 *   - verify the seed wallet roster matches the funded chain accounts,
 *   - run scripts/seed.ts (idempotent database seed),
 *   - start scripts/indexer.ts against the local node with a 2s poll,
 *     restarting any previous instance so it picks up fresh addresses.
 *
 * Everything long-running is recorded under e2e/.pids and killed by
 * e2e/global-teardown.ts. Stale pid files are cleaned on entry.
 */

// Loads .env.local / .env into process.env and stubs the server-only marker,
// exactly like the repo's other scripts.
import '../scripts/lib/bootstrap';

import { spawnSync } from 'node:child_process';
import {
  CHAIN_RPC_URL,
  REPO_ROOT,
  ensureChainStack,
  killPidFile,
  spawnDaemon,
  type ChainJson,
} from './stack';
import { HARDHAT_ACCOUNT_INDEX, WALLETS, WALLET_ROLES } from './wallets';

function log(message: string): void {
  console.log(`[e2e-setup] ${message}`);
}

function assertRequiredEnv(): void {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!serviceKey || serviceKey === 'placeholder') {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is missing or still "placeholder" in .env.local. ' +
        'The e2e suite seeds and asserts against the remote Supabase project and cannot run without it. ' +
        'Set the real service role key, then run `npm run e2e` again.',
    );
  }
  const missing = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_JWT_SECRET',
    'SUMSUB_WEBHOOK_SECRET',
    'AUTH_PRIVATE_KEY',
    'NEXT_PUBLIC_THIRDWEB_AUTH_DOMAIN',
  ].filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required env in .env.local for the e2e suite: ${missing.join(', ')}`,
    );
  }
}

/**
 * The wallets seeded into the database (e2e/wallets.ts, consumed by
 * scripts/seed.ts) must be the funded hardhat accounts the deploy script
 * wrote into e2e/.chain.json, or on-chain actors and database users diverge.
 */
function assertWalletAlignment(chain: ChainJson): void {
  for (const role of WALLET_ROLES) {
    const index = HARDHAT_ACCOUNT_INDEX[role];
    const funded = chain.accounts[index];
    if (!funded) {
      throw new Error(
        `e2e/.chain.json has no funded account at index ${index} for role "${role}". ` +
          'Re-run the deploy (delete e2e/.chain.json) with FUND_ACCOUNTS >= 6.',
      );
    }
    if (funded.address.toLowerCase() !== WALLETS[role].toLowerCase()) {
      throw new Error(
        `Wallet roster mismatch for "${role}": e2e/wallets.ts says ${WALLETS[role]} ` +
          `but e2e/.chain.json account ${index} is ${funded.address}. ` +
          'e2e/wallets.ts must list the standard hardhat accounts in deploy order.',
      );
    }
  }
  log('wallet roster matches funded chain accounts');
}

function runSeed(): void {
  log('running scripts/seed.ts');
  const result = spawnSync('npx', ['tsx', 'scripts/seed.ts'], {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: 'inherit',
    timeout: 180_000,
  });
  if (result.status !== 0) {
    throw new Error(
      `scripts/seed.ts exited with status ${result.status ?? 'unknown'}. ` +
        'Check Supabase credentials and that migrations (including asset categories) are applied.',
    );
  }
}

function startIndexer(chain: ChainJson): void {
  // Always restart: a previous instance may hold stale contract addresses.
  killPidFile('indexer');
  spawnDaemon({
    name: 'indexer',
    command: 'npx',
    args: ['tsx', 'scripts/indexer.ts'],
    cwd: REPO_ROOT,
    marker: 'indexer',
    env: {
      ...process.env,
      INDEXER_RPC_URL: CHAIN_RPC_URL,
      INDEXER_POLL_MS: '2000',
      NEXT_PUBLIC_THIRDWEB_CHAIN_ID: String(chain.chainId),
      NEXT_PUBLIC_THIRDWEB_CONTRACT_ADDRESS: chain.marketplace,
      NEXT_PUBLIC_USDC_CONTRACT_ADDRESS: chain.usdc,
      NEXT_PUBLIC_LOCAL_MARKETPLACE_ADDRESS: chain.marketplace,
      NEXT_PUBLIC_LOCAL_USDC_ADDRESS: chain.usdc,
    },
  });
}

export default async function globalSetup(): Promise<void> {
  assertRequiredEnv();
  const chain = await ensureChainStack();
  assertWalletAlignment(chain);
  runSeed();
  startIndexer(chain);
  log('stack ready: chain on 8545, app on 3100, indexer polling every 2s');
}
