/**
 * Phase 9 demo recording configuration.
 *
 * Same stack as playwright.config.ts (hardhat chain, seeded database, live
 * indexer), with three differences:
 *   - video is always recorded, one file per test, at a readable 1280x720;
 *   - actions are slowed to about 400 ms so a human can follow the pointer;
 *   - no retries, so each test yields exactly one video.
 *
 * Playwright records one video per test, so the existing journey specs already
 * give one video per function. The long walkthrough lives in
 * e2e/specs/99-full-journey.demo.spec.ts, which the normal suite ignores.
 *
 * Usage: npm run demos (records, converts to mp4, writes docs/demos/INDEX.md).
 */

import './scripts/lib/bootstrap';

import { defineConfig, devices } from '@playwright/test';

const APP_PORT = 3100;

export default defineConfig({
  testDir: 'e2e/specs',
  workers: 1,
  fullyParallel: false,
  // A retry would produce a second video for the same function.
  retries: 0,
  // Slow motion stretches every step, so the per-test budget grows.
  timeout: 600_000,
  expect: { timeout: 30_000 },
  reporter: [['list'], ['json', { outputFile: 'e2e/demo-report.json' }]],
  outputDir: 'test-results-demos',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${APP_PORT}`,
    video: { mode: 'on', size: { width: 1280, height: 720 } },
    viewport: { width: 1280, height: 720 },
    trace: 'off',
    screenshot: 'off',
    launchOptions: { slowMo: 400 },
  },
  webServer: {
    command: 'npx tsx e2e/start-web.ts',
    port: APP_PORT,
    reuseExistingServer: true,
    timeout: 480_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
