/**
 * Playwright global teardown: stops the processes global setup / start-web
 * recorded under e2e/.pids (indexer first, then the hardhat node). Idempotent
 * and crash-safe: missing pid files, dead pids and recycled pids are all
 * handled by killPidFile. The Next dev server itself is managed by
 * Playwright's webServer plugin and is torn down after this hook.
 *
 * e2e/.chain.json and e2e/.env.chain are intentionally left in place: a fresh
 * hardhat node redeploys to the same deterministic addresses (deployer nonces
 * restart at 0), so the files stay valid and speed up the next run.
 */

import { killPidFile } from './stack';

export default async function globalTeardown(): Promise<void> {
  killPidFile('indexer');
  killPidFile('hardhat');
  console.log('[e2e-teardown] indexer and hardhat node stopped');
}
