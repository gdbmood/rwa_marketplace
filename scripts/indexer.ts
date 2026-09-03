/**
 * Long running local indexer for development and e2e.
 *
 * Usage:
 *   npx tsx scripts/indexer.ts
 *
 * Environment (read from .env.local / .env like the app):
 *   NEXT_PUBLIC_THIRDWEB_CHAIN_ID          chain to index
 *   NEXT_PUBLIC_THIRDWEB_CONTRACT_ADDRESS  marketplace proxy address
 *   INDEXER_RPC_URL                        RPC override (e.g. http://127.0.0.1:8545)
 *   INDEXER_POLL_MS                        base sleep between cycles (default 5000)
 *   INDEXER_MAX_BLOCKS / INDEXER_MAX_EVENTS / INDEXER_START_BLOCK / INDEXER_CONFIRMATIONS
 *
 * Runs the exact same ingest cycle as the /api/indexer/run cron endpoint, in
 * a loop with sleep and jitter, until SIGINT or SIGTERM.
 */

import './lib/bootstrap';
import { runIngestCycle } from '../src/lib/indexer/ingest';

const BASE_POLL_MS = (() => {
  const parsed = Number.parseInt(process.env.INDEXER_POLL_MS ?? '', 10);
  return Number.isNaN(parsed) || parsed <= 0 ? 5000 : parsed;
})();
const JITTER_MS = 1000;

let stopping = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(payload: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...payload }));
}

async function main(): Promise<void> {
  process.on('SIGINT', () => {
    stopping = true;
    log({ msg: 'shutdown requested (SIGINT)' });
  });
  process.on('SIGTERM', () => {
    stopping = true;
    log({ msg: 'shutdown requested (SIGTERM)' });
  });

  log({ msg: 'indexer starting', pollMs: BASE_POLL_MS });

  while (!stopping) {
    try {
      const result = await runIngestCycle();
      log({ msg: 'cycle complete', ...result });
    } catch (error) {
      log({
        msg: 'cycle failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (stopping) {
      break;
    }
    const jitter = Math.floor(Math.random() * JITTER_MS);
    await sleep(BASE_POLL_MS + jitter);
  }

  log({ msg: 'indexer stopped' });
}

main().catch((error) => {
  log({ msg: 'fatal', error: error instanceof Error ? error.stack : String(error) });
  process.exitCode = 1;
});
