/**
 * Playwright e2e configuration. See e2e/README.md for how the stack fits
 * together and what env is required.
 *
 * Ordering note: Playwright starts the webServer BEFORE global setup, so the
 * webServer command (e2e/start-web.ts) brings the chain up itself (hardhat
 * node, contract deploy, e2e/.env.chain) and then boots `next dev` with that
 * env; e2e/global-setup.ts re-checks the chain idempotently, seeds the
 * database and starts the indexer.
 */

// Load .env.local so config-time decisions and fixtures see the same env as
// the app (also stubs the server-only marker for src/ imports from node).
import './scripts/lib/bootstrap';

import { defineConfig, devices } from '@playwright/test';

const APP_PORT = 3100;

export default defineConfig({
  testDir: 'e2e/specs',
  // The chain and the remote database are shared mutable state: one worker,
  // specs run in file order, no parallelism inside files either.
  workers: 1,
  fullyParallel: false,
  // One retry so trace collection on first retry can actually trigger; specs
  // must stay idempotent against already-seeded state.
  retries: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'e2e/report', open: 'never' }],
  ],
  outputDir: 'test-results',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    trace: 'on-first-retry',
    // Phase 9 flips this to 'on'.
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // Two projects purely for ordering: "reconcile" holds only the final
  // chain-vs-database reconciliation gate (e2e/specs/reconcile.spec.ts) and
  // depends on "suites" (every other spec), so it always runs last and is
  // skipped when the suites failed. Note that project dependencies always run
  // in full: filtering a run down to reconcile.spec.ts still executes the
  // whole suites project first.
  projects: [
    {
      name: 'suites',
      use: { ...devices['Desktop Chrome'] },
      // 99-full-journey is the demo walkthrough: it re-covers ground the
      // focused specs already assert, so the normal suite skips it and only
      // playwright.demo.config.ts records it.
      testIgnore: [/reconcile\.spec\.ts/, /\.demo\.spec\.ts/],
    },
    {
      name: 'reconcile',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /reconcile\.spec\.ts/,
      dependencies: ['suites'],
    },
  ],
  webServer: {
    // Brings up hardhat + contracts first, then next dev on 3100 with
    // TEST_MODE=1 and the deployed addresses from e2e/.env.chain.
    command: 'npx tsx e2e/start-web.ts',
    port: APP_PORT,
    reuseExistingServer: true,
    // Chain bring-up (node boot plus deploy) plus a full next build.
    timeout: 480_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
