/**
 * Local e2e stack orchestration: hardhat node, contract deployment, chain env
 * file, and pid-file process management. Shared by e2e/start-web.ts (the
 * Playwright webServer command) and e2e/global-setup.ts.
 *
 * Why both entry points call ensureChainStack(): Playwright launches the
 * webServer BEFORE globalSetup runs (webServer is a plugin, and plugin setup
 * tasks precede global setup tasks), so the chain plus e2e/.env.chain must
 * already exist by the time `next dev` boots or the NEXT_PUBLIC_* contract
 * addresses would be missing. start-web.ts therefore brings the chain up
 * itself; global-setup.ts calls ensureChainStack() again as an idempotent
 * no-op (it also covers the reuseExistingServer path where start-web.ts never
 * ran). The two never run concurrently: Playwright finishes webServer setup
 * (port 3100 up) before it invokes globalSetup.
 *
 * Everything here is idempotent and crash-safe:
 *   - pid files live under e2e/.pids/ and record pid, command marker and
 *     start time; stale files (dead pid, or a recycled pid whose command no
 *     longer matches) are detected and removed,
 *   - a hardhat node already listening on the port is reused,
 *   - deployment is skipped when e2e/.chain.json addresses still have code
 *     on the running node,
 *   - e2e/.env.chain is rewritten from e2e/.chain.json on every call.
 */

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';

export const REPO_ROOT = path.resolve(__dirname, '..');
export const E2E_DIR = path.join(REPO_ROOT, 'e2e');
export const PIDS_DIR = path.join(E2E_DIR, '.pids');
export const CHAIN_JSON_PATH = path.join(E2E_DIR, '.chain.json');
export const ENV_CHAIN_PATH = path.join(E2E_DIR, '.env.chain');
export const CONTRACTS_DIR = path.join(REPO_ROOT, 'contracts');

export const CHAIN_RPC_URL = 'http://127.0.0.1:8545';
export const CHAIN_PORT = 8545;
export const CHAIN_ID = 31337;
export const APP_PORT = 3100;

/**
 * contracts/hardhat.config.ts validates PRIVATE_KEY for its remote network
 * entries even when only the local node is used, so hardhat commands get a
 * dummy key (hardhat dev account 0) when the env has none. Never used to
 * sign anything on a real network here: we only ever run node/run --network
 * localhost.
 */
const HARDHAT_CONFIG_FALLBACK_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

function hardhatEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PRIVATE_KEY: process.env.PRIVATE_KEY || HARDHAT_CONFIG_FALLBACK_KEY,
    ...extra,
  };
}

export interface ChainJson {
  generatedAt: string;
  network: string;
  chainId: number;
  rpcUrl: string;
  marketplace: string;
  usdc: string;
  feeRecipient: string;
  accounts: Array<{ address: string; privateKey: string }>;
}

function log(message: string): void {
  console.log(`[e2e-stack] ${message}`);
}

// -- pid files ---------------------------------------------------------------

interface PidRecord {
  pid: number;
  /** Substring expected in the process command line, guards recycled pids. */
  marker: string;
  startedAt: string;
}

function pidFilePath(name: string): string {
  return path.join(PIDS_DIR, `${name}.pid`);
}

function readPidRecord(name: string): PidRecord | null {
  try {
    const raw = fs.readFileSync(pidFilePath(name), 'utf8');
    const parsed = JSON.parse(raw) as PidRecord;
    if (typeof parsed.pid !== 'number' || typeof parsed.marker !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Command line of a pid, or null when the process is gone. */
function commandOf(pid: number): string | null {
  try {
    const out = execFileSync('ps', ['-p', String(pid), '-o', 'command='], {
      encoding: 'utf8',
    });
    const line = out.trim();
    return line.length > 0 ? line : null;
  } catch {
    return null;
  }
}

/** True when the pid record points at a live process we actually started. */
function pidRecordAlive(record: PidRecord): boolean {
  if (!isAlive(record.pid)) {
    return false;
  }
  const command = commandOf(record.pid);
  return command !== null && command.includes(record.marker);
}

export function writePidRecord(name: string, pid: number, marker: string): void {
  fs.mkdirSync(PIDS_DIR, { recursive: true });
  const record: PidRecord = { pid, marker, startedAt: new Date().toISOString() };
  fs.writeFileSync(pidFilePath(name), `${JSON.stringify(record, null, 2)}\n`);
}

function sleepSync(ms: number): void {
  const buffer = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(buffer), 0, 0, ms);
}

/**
 * Kills the process recorded under a pid file (SIGTERM, then SIGKILL after a
 * grace period) and removes the file. Safe on missing files, dead pids and
 * recycled pids (command marker mismatch means we only delete the file).
 */
export function killPidFile(name: string): void {
  const record = readPidRecord(name);
  const file = pidFilePath(name);
  if (!record) {
    fs.rmSync(file, { force: true });
    return;
  }
  if (!pidRecordAlive(record)) {
    log(`stale pid file ${name} (pid ${record.pid} gone), cleaning up`);
    fs.rmSync(file, { force: true });
    return;
  }
  log(`stopping ${name} (pid ${record.pid})`);
  try {
    // Negative pid kills the whole detached process group.
    process.kill(-record.pid, 'SIGTERM');
  } catch {
    try {
      process.kill(record.pid, 'SIGTERM');
    } catch {
      // Already gone.
    }
  }
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && isAlive(record.pid)) {
    sleepSync(100);
  }
  if (isAlive(record.pid)) {
    log(`${name} did not exit, sending SIGKILL`);
    try {
      process.kill(-record.pid, 'SIGKILL');
    } catch {
      try {
        process.kill(record.pid, 'SIGKILL');
      } catch {
        // Already gone.
      }
    }
  }
  fs.rmSync(file, { force: true });
}

/** Removes pid files whose processes are gone. Called at setup start. */
export function cleanStalePidFiles(): void {
  if (!fs.existsSync(PIDS_DIR)) {
    return;
  }
  for (const entry of fs.readdirSync(PIDS_DIR)) {
    if (!entry.endsWith('.pid')) {
      continue;
    }
    const name = entry.slice(0, -'.pid'.length);
    const record = readPidRecord(name);
    if (!record || !pidRecordAlive(record)) {
      log(`removing stale pid file ${entry}`);
      fs.rmSync(path.join(PIDS_DIR, entry), { force: true });
    }
  }
}

/**
 * Spawns a detached long-running process, logs its output under e2e/.pids/
 * and records its pid. The process survives the parent (own process group),
 * so global-teardown can kill it by pid file even when the parent that
 * spawned it (start-web.ts or global-setup.ts) is long gone.
 */
export function spawnDaemon(options: {
  name: string;
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  marker: string;
}): number {
  fs.mkdirSync(PIDS_DIR, { recursive: true });
  const logPath = path.join(PIDS_DIR, `${options.name}.log`);
  const out = fs.openSync(logPath, 'a');
  const child = spawn(options.command, options.args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    detached: true,
    stdio: ['ignore', out, out],
  });
  fs.closeSync(out);
  if (child.pid === undefined) {
    throw new Error(`Failed to spawn ${options.name} (${options.command})`);
  }
  child.unref();
  writePidRecord(options.name, child.pid, options.marker);
  log(`${options.name} started (pid ${child.pid}, log ${logPath})`);
  return child.pid;
}

// -- port and rpc helpers ----------------------------------------------------

export function isPortOpen(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(1000);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

export async function waitForPort(
  port: number,
  timeoutMs: number,
  label: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(port)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for ${label} on port ${port}`);
}

export async function rpcCall<T>(method: string, params: unknown[] = []): Promise<T> {
  const response = await fetch(CHAIN_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!response.ok) {
    throw new Error(`RPC ${method} failed with HTTP ${response.status}`);
  }
  const body = (await response.json()) as { result?: T; error?: { message?: string } };
  if (body.error) {
    throw new Error(`RPC ${method} failed: ${body.error.message ?? 'unknown error'}`);
  }
  return body.result as T;
}

async function rpcResponsive(): Promise<boolean> {
  try {
    const chainIdHex = await rpcCall<string>('eth_chainId');
    return Number.parseInt(chainIdHex, 16) === CHAIN_ID;
  } catch {
    return false;
  }
}

async function hasCode(address: string): Promise<boolean> {
  try {
    const code = await rpcCall<string>('eth_getCode', [address, 'latest']);
    return typeof code === 'string' && code !== '0x' && code !== '0x0';
  } catch {
    return false;
  }
}

// -- chain json / env file ---------------------------------------------------

export function readChainJson(): ChainJson | null {
  try {
    return JSON.parse(fs.readFileSync(CHAIN_JSON_PATH, 'utf8')) as ChainJson;
  } catch {
    return null;
  }
}

/**
 * Rewrites e2e/.env.chain from e2e/.chain.json. The file is a plain
 * KEY=value env file that e2e/start-web.ts loads into process.env before it
 * spawns `next dev`; process env beats .env.local inside Next, so these
 * values override the placeholder addresses committed there.
 */
export function writeEnvChain(chain: ChainJson): void {
  const lines = [
    '# Generated by e2e/stack.ts from e2e/.chain.json. Do not edit or commit.',
    `NEXT_PUBLIC_LOCAL_MARKETPLACE_ADDRESS=${chain.marketplace}`,
    `NEXT_PUBLIC_LOCAL_USDC_ADDRESS=${chain.usdc}`,
    `NEXT_PUBLIC_THIRDWEB_CONTRACT_ADDRESS=${chain.marketplace}`,
    `NEXT_PUBLIC_USDC_CONTRACT_ADDRESS=${chain.usdc}`,
    `NEXT_PUBLIC_THIRDWEB_CHAIN_ID=${chain.chainId}`,
    `INDEXER_RPC_URL=${chain.rpcUrl}`,
  ];
  fs.writeFileSync(ENV_CHAIN_PATH, `${lines.join('\n')}\n`);
  log(`wrote ${ENV_CHAIN_PATH}`);
}

/** Parses e2e/.env.chain into a plain object (empty when missing). */
export function readEnvChain(): Record<string, string> {
  const values: Record<string, string> = {};
  let content: string;
  try {
    content = fs.readFileSync(ENV_CHAIN_PATH, 'utf8');
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
    values[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return values;
}

// -- stack bring-up ----------------------------------------------------------

async function ensureHardhatNode(): Promise<void> {
  if (await rpcResponsive()) {
    log('hardhat node already running, reusing it');
    return;
  }
  if (await isPortOpen(CHAIN_PORT)) {
    throw new Error(
      `Port ${CHAIN_PORT} is occupied by something that does not answer eth_chainId with ${CHAIN_ID}. Free the port and retry.`,
    );
  }
  // A recorded hardhat process that is alive but not serving is wedged.
  killPidFile('hardhat');
  spawnDaemon({
    name: 'hardhat',
    command: 'npx',
    args: ['hardhat', 'node', '--port', String(CHAIN_PORT)],
    cwd: CONTRACTS_DIR,
    marker: 'hardhat',
    env: hardhatEnv(),
  });
  await waitForPort(CHAIN_PORT, 60_000, 'hardhat node');
  // The port opens slightly before the RPC is ready; poll eth_chainId too.
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await rpcResponsive()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('hardhat node opened the port but never answered eth_chainId');
}

async function ensureContractsDeployed(): Promise<ChainJson> {
  const existing = readChainJson();
  if (
    existing &&
    existing.chainId === CHAIN_ID &&
    (await hasCode(existing.marketplace)) &&
    (await hasCode(existing.usdc))
  ) {
    log('contracts already deployed on the running node, skipping deploy');
    return existing;
  }
  log('deploying contracts (contracts/scripts/deploy_local.ts)');
  const result = spawnSync(
    'npx',
    ['hardhat', 'run', 'scripts/deploy_local.ts', '--network', 'localhost'],
    {
      cwd: CONTRACTS_DIR,
      env: hardhatEnv({ FUND_ACCOUNTS: '10' }),
      stdio: 'inherit',
      timeout: 180_000,
    },
  );
  if (result.status !== 0) {
    throw new Error(`deploy_local.ts exited with status ${result.status ?? 'unknown'}`);
  }
  const deployed = readChainJson();
  if (!deployed) {
    throw new Error(`deploy_local.ts succeeded but ${CHAIN_JSON_PATH} is missing`);
  }
  if (deployed.chainId !== CHAIN_ID) {
    throw new Error(
      `deploy wrote chainId ${deployed.chainId}, expected ${CHAIN_ID} (local hardhat)`,
    );
  }
  return deployed;
}

/**
 * Brings the chain half of the stack up: hardhat node on 8545, contracts
 * deployed, e2e/.chain.json and e2e/.env.chain in place. Idempotent; safe to
 * call from both start-web.ts and global-setup.ts.
 */
export async function ensureChainStack(): Promise<ChainJson> {
  cleanStalePidFiles();
  await ensureHardhatNode();
  const chain = await ensureContractsDeployed();
  writeEnvChain(chain);
  return chain;
}
