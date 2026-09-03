/**
 * Script bootstrap. Import this FIRST in every scripts/*.ts entry point
 * (before anything that touches src/lib), it does two things:
 *
 * 1. Stubs the 'server-only' marker package. The src/lib modules import it to
 *    keep themselves out of client bundles; outside a React Server Components
 *    runtime the package throws at import time. Scripts run under `npx tsx`,
 *    which compiles to CommonJS here (the root package.json has no
 *    "type": "module"), so pre-populating the require cache neutralizes it.
 *
 * 2. Loads .env.local and .env from the repo root, matching Next.js
 *    precedence (.env.local wins, existing process.env always wins), so the
 *    scripts see the same configuration as the app without needing dotenv.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// -- 1. server-only stub ------------------------------------------------------

try {
  const resolved = require.resolve('server-only');
  if (!require.cache[resolved]) {
    const stub = {
      id: resolved,
      filename: resolved,
      loaded: true,
      exports: {},
      children: [],
      paths: [],
    };
    require.cache[resolved] = stub as unknown as NodeJS.Module;
  }
} catch {
  // Package not installed; nothing to stub.
}

// -- 2. env loading -----------------------------------------------------------

function parseEnvFile(filePath: string): Record<string, string> {
  const values: Record<string, string> = {};
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return values;
  }
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

for (const file of ['.env.local', '.env']) {
  const parsed = parseEnvFile(path.join(REPO_ROOT, file));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export const repoRoot = REPO_ROOT;
