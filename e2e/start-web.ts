/**
 * Playwright webServer command (see playwright.config.ts).
 *
 * Playwright launches the webServer BEFORE globalSetup runs, so this wrapper
 * cannot rely on global-setup having prepared anything. It:
 *
 *   1. brings the chain stack up itself via ensureChainStack() (hardhat node,
 *      contract deployment, e2e/.chain.json, e2e/.env.chain) - idempotent, so
 *      the later ensureChainStack() call in global-setup is a no-op,
 *   2. loads e2e/.env.chain into process.env (this is the "webServer command
 *      sources e2e/.env.chain" mechanism: process env beats .env.local inside
 *      Next, so the deployed local contract addresses override the
 *      placeholders committed in .env.local),
 *   3. builds the app and serves it with `next start` on port 3100 with
 *      TEST_MODE=1 and NEXT_PUBLIC_TEST_MODE=1.
 *
 * Why a production build instead of `next dev`:
 * `next dev` compiles routes on first request, and those compiles land INSIDE
 * test timeouts. Measured on this repo: POST /api/onramp/webhook 40.9s,
 * GET /api/onramp/status 32.1s, POST /api/onramp/create 14.1s, all of it
 * compilation rather than application work. That is what made the card
 * on-ramp spec flaky and, because the specs are serial, a single timeout left
 * a dozen later tests unrun. A build costs about a minute once, then every
 * route responds immediately, so the suite is both faster and deterministic.
 *
 * NEXT_PUBLIC_TEST_MODE is inlined at build time, so this build enables the
 * test-only surfaces (the test auth route, the local signer, the mock on-ramp)
 * and must never be shipped. It is a throwaway artifact for the suite; the
 * production deployment builds from a clean environment without these flags.
 *
 * Set E2E_DEV=1 to fall back to `next dev` (useful when iterating on UI code
 * with hot reload, at the cost of the compile-time flakiness described above).
 *
 * Run it manually with `npm run e2e:web` to get a server wired exactly like
 * the one the suite uses (useful with reuseExistingServer: true).
 */

import { spawn } from 'node:child_process';
import { APP_PORT, REPO_ROOT, ensureChainStack, readEnvChain } from './stack';

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: REPO_ROOT, env, stdio: 'inherit' });
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with ${signal ?? code}`));
    });
    child.on('error', reject);
  });
}

async function main(): Promise<void> {
  await ensureChainStack();

  const chainEnv = readEnvChain();
  if (!chainEnv.NEXT_PUBLIC_LOCAL_MARKETPLACE_ADDRESS) {
    throw new Error('e2e/.env.chain is missing NEXT_PUBLIC_LOCAL_MARKETPLACE_ADDRESS');
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...chainEnv,
    TEST_MODE: '1',
    NEXT_PUBLIC_TEST_MODE: '1',
  };

  const useDev = process.env.E2E_DEV === '1';

  if (!useDev) {
    // A separate build directory keeps this test-mode build from clobbering
    // the developer's own .next, and keeps `npm run dev` unaffected.
    env.E2E_DIST_DIR = '.next-e2e';
    console.log('[e2e-web] building the app in test mode (one time, about a minute)');
    await run('npx', ['next', 'build'], env);
  }

  const args = useDev
    ? ['next', 'dev', '-p', String(APP_PORT)]
    : ['next', 'start', '-p', String(APP_PORT)];
  console.log(`[e2e-web] starting ${useDev ? 'next dev' : 'next start'} on port ${APP_PORT}`);

  const child = spawn('npx', args, { cwd: REPO_ROOT, env, stdio: 'inherit' });

  const forward = (signal: NodeJS.Signals) => {
    child.kill(signal);
  };
  process.on('SIGINT', forward);
  process.on('SIGTERM', forward);

  child.on('exit', (code, signal) => {
    process.exit(code ?? (signal ? 1 : 0));
  });
}

main().catch((error) => {
  console.error('[e2e-web] failed:', error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
