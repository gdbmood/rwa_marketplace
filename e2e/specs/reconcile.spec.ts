/**
 * Final consistency gate: after every other suite has mutated the chain and
 * the database, scripts/reconcile-chain.ts must report ZERO unexplained
 * diffs. It compares every holdings row against balanceOf on the asset's
 * fraction token and every active primary listing against fetchAllListings
 * plus the issuer's live balance, exiting nonzero on any unexplained drift.
 *
 * ORDERING: this file must run LAST. The Playwright config supports project
 * dependencies, so playwright.config.ts defines a dedicated "reconcile"
 * project that matches only this file and depends on the "suites" project
 * holding every other spec (a numeric filename prefix would have worked too,
 * but the task pins this exact filename and project dependencies keep it).
 * Consequences of the dependency mechanism worth knowing:
 *   - `npx playwright test reconcile.spec.ts` first runs the whole "suites"
 *     project, because dependencies always execute in full;
 *   - if any suite test fails, this project is skipped (a reconcile over a
 *     half-finished run would only report the wreckage anyway).
 *
 * The script is executed as a real child process (npx tsx), the same way an
 * operator would run it, with the chain env pinned to the local deployment
 * from e2e/.chain.json (process env beats the placeholder addresses in
 * .env.local inside the script's bootstrap).
 */

import { spawnSync } from 'node:child_process';
import { expect, test } from '../fixtures';
import { CHAIN_ID, CHAIN_RPC_URL, REPO_ROOT, readChainJson } from '../stack';

interface ReconcileReport {
  chainId: number;
  checkedHoldings: number;
  checkedListings: number;
  hasPendingEvents: boolean;
  diffs: Array<Record<string, unknown>>;
  unexplained: number;
}

/** Extracts the JSON object the --json mode prints from mixed stdout. */
function parseReport(stdout: string): ReconcileReport {
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`reconcile-chain.ts printed no JSON report. stdout:\n${stdout}`);
  }
  return JSON.parse(stdout.slice(start, end + 1)) as ReconcileReport;
}

test.describe('chain reconciliation', () => {
  test('reconcile-chain.ts exits 0 with zero unexplained diffs', async ({ db }) => {
    test.setTimeout(240_000);
    const service = db();
    const chain = readChainJson();
    expect(chain, 'e2e/.chain.json missing; run through `npm run e2e`').not.toBeNull();

    // First let the indexer drain chain_events completely. Unprocessed events
    // downgrade every diff to PENDING (explained), which would hollow out the
    // zero-unexplained assertion below; a drained queue makes it strict.
    await expect
      .poll(
        async () => {
          const pending = await service
            .from('chain_events')
            .select('id')
            .eq('chain_id', CHAIN_ID)
            .eq('processed', false)
            .limit(1);
          if (pending.error) {
            throw new Error(`chain_events poll failed: ${pending.error.message}`);
          }
          return pending.data.length;
        },
        {
          timeout: 120_000,
          intervals: [2000],
          message: 'indexer never drained chain_events; check e2e/.pids/indexer.log',
        },
      )
      .toBe(0);

    const result = spawnSync(
      'npx',
      [
        'tsx',
        'scripts/reconcile-chain.ts',
        '--chain-id',
        String(CHAIN_ID),
        '--rpc',
        CHAIN_RPC_URL,
        '--json',
      ],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 180_000,
        env: {
          ...process.env,
          // The script's bootstrap loads .env.local, whose committed contract
          // addresses are placeholders; explicit process env wins.
          NEXT_PUBLIC_THIRDWEB_CHAIN_ID: String(CHAIN_ID),
          NEXT_PUBLIC_THIRDWEB_CONTRACT_ADDRESS: chain!.marketplace,
          NEXT_PUBLIC_USDC_CONTRACT_ADDRESS: chain!.usdc,
          NEXT_PUBLIC_LOCAL_MARKETPLACE_ADDRESS: chain!.marketplace,
          NEXT_PUBLIC_LOCAL_USDC_ADDRESS: chain!.usdc,
          INDEXER_RPC_URL: CHAIN_RPC_URL,
        },
      },
    );

    expect(
      result.status,
      `reconcile-chain.ts exited ${result.status}.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    ).toBe(0);

    const report = parseReport(result.stdout);
    expect(report.chainId).toBe(CHAIN_ID);
    expect(
      report.unexplained,
      `unexplained diffs found:\n${JSON.stringify(report.diffs, null, 2)}`,
    ).toBe(0);
    // With a drained event queue nothing may hide behind PENDING either.
    expect(report.hasPendingEvents).toBe(false);
    // The run above created real holdings and listings; an empty report would
    // mean the script looked at the wrong chain or database.
    expect(report.checkedHoldings).toBeGreaterThan(0);
    expect(report.checkedListings).toBeGreaterThan(0);
  });
});
