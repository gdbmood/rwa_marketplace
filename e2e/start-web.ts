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
 *   3. execs `next dev` on port 3100 with TEST_MODE=1 and
 *      NEXT_PUBLIC_TEST_MODE=1.
 *
 * Run it manually with `npm run e2e:web` to get a dev server wired exactly
 * like the one the suite uses (useful with reuseExistingServer: true).
 */

import { spawn } from 'node:child_process';
import { APP_PORT, REPO_ROOT, ensureChainStack, readEnvChain } from './stack';

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

  console.log(`[e2e-web] starting next dev on port ${APP_PORT}`);
  const child = spawn('npx', ['next', 'dev', '-p', String(APP_PORT)], {
    cwd: REPO_ROOT,
    env,
    stdio: 'inherit',
  });

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
