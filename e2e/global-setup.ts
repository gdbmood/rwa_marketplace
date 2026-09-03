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
  APP_PORT,
  CHAIN_RPC_URL,
  REPO_ROOT,
  ensureChainStack,
  killPidFile,
  spawnDaemon,
  type ChainJson,
} from './stack';
import { HARDHAT_ACCOUNT_INDEX, WALLETS, WALLET_ROLES } from './wallets';
import { resetStaleChainStateWithServiceClient } from './helpers/investor';

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

/**
 * Pre-compiles the app's routes AND fetches their client chunk assets before
 * any spec opens a browser. Two reasons:
 *   - next dev compiles routes on first hit, so cold pages otherwise cost
 *     5-15s inside test timeouts;
 *   - a browser that requests a client chunk while the compiler is still
 *     emitting it can receive a truncated file; the resulting SyntaxError
 *     kills hydration permanently (spinner forever), which is exactly the
 *     "first navigation of a cold run hangs regardless of timeout" failure.
 * Fetching every /_next asset referenced by the warmed pages guarantees the
 * chunks are fully emitted and cached before a real browser asks for them.
 * Best effort: a failed warm never fails the run.
 */
async function warmAppRoutes(): Promise<void> {
  const mainOrigin = `http://localhost:${APP_PORT}`;
  const businessOrigin = `http://business.localhost:${APP_PORT}`;
  const dummyId = '00000000-0000-0000-0000-000000000000';
  const targets = [
    `${mainOrigin}/`,
    `${mainOrigin}/marketplace`,
    `${mainOrigin}/profile`,
    `${mainOrigin}/portfolio`,
    `${mainOrigin}/settings`,
    `${mainOrigin}/asset/${dummyId}`,
    `${mainOrigin}/asset/${dummyId}/docs`,
    `${mainOrigin}/asset/${dummyId}/buy/1`,
    `${mainOrigin}/onramp/mock`,
    `${businessOrigin}/dashboard`,
    `${businessOrigin}/profile`,
    `${businessOrigin}/list-new-asset`,
    `${businessOrigin}/settings`,
    `${businessOrigin}/verify-business`,
    // API routes: a GET may 405 on POST-only handlers, but the module still
    // compiles, which is all the warm-up needs (e.g. the first onramp webhook
    // call otherwise pays its whole compile inside a test's expect window).
    `${mainOrigin}/api/onramp/create`,
    `${mainOrigin}/api/onramp/status`,
    `${mainOrigin}/api/onramp/webhook`,
    `${mainOrigin}/api/sumsub-webhook`,
    `${mainOrigin}/api/rls-token`,
    `${mainOrigin}/api/chain-webhook`,
  ];
  const started = Date.now();
  let pagesWarmed = 0;
  let assetsWarmed = 0;
  for (const url of targets) {
    try {
      const origin = new URL(url).origin;
      const response = await fetch(url, { redirect: 'manual' });
      const html = await response.text();
      pagesWarmed += 1;
      const assets = new Set<string>();
      const assetPattern = /(?:src|href)="(\/_next\/[^"]+)"/g;
      for (let match = assetPattern.exec(html); match; match = assetPattern.exec(html)) {
        assets.add(match[1].replace(/&amp;/g, '&'));
      }
      await Promise.all(
        Array.from(assets, (asset) =>
          fetch(`${origin}${asset}`)
            .then((res) => res.arrayBuffer())
            .then(() => {
              assetsWarmed += 1;
            })
            .catch(() => undefined),
        ),
      );
    } catch {
      // Warming is best effort; the specs still work against cold routes,
      // just slower and with a small chunk-race window.
    }
  }
  log(
    `warmed ${pagesWarmed}/${targets.length} route(s) and ${assetsWarmed} client asset(s) ` +
      `in ${Math.round((Date.now() - started) / 1000)}s`,
  );
}

export default async function globalSetup(): Promise<void> {
  assertRequiredEnv();
  const chain = await ensureChainStack();
  assertWalletAlignment(chain);

  // Run-level stale-chain guard (the "recommended long-term home" noted in
  // e2e/helpers/investor.ts): the remote database survives runs while the
  // hardhat chain does not, and deterministic deploys re-issue the same nft
  // ids and token addresses. Without this, the FIRST mint of a run collides
  // with an active asset row left by a previous run (same erc20 token
  // address), the indexer skips the promotion as "already promoted", and
  // every spec that mints hangs. Runs before the seed and the indexer so
  // both start from a database consistent with the current chain.
  const stale = await resetStaleChainStateWithServiceClient();
  log(
    `stale-chain guard: ${stale.staleEventTxCount} dead-chain event tx(es) removed, ` +
      `cursors ${stale.cursorsDeleted ? 'reset' : 'kept'}, ` +
      `${stale.retiredAssetIds.length} asset(s) retired`,
  );

  runSeed();
  startIndexer(chain);
  await warmAppRoutes();
  log('stack ready: chain on 8545, app on 3100, indexer polling every 2s');
}
