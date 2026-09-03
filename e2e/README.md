# E2E harness

Playwright suite that exercises the real app against a local hardhat chain,
the real indexer loop, and the remote Supabase project, with all external
providers replaced by the repo's test mode (see
docs/architecture/IMPLEMENTATION_PLAN.md, "Test mode").

## The one command

```
npm run e2e
```

That is the whole thing. It orchestrates every process, runs the specs in
`e2e/specs/` sequentially on a single worker, and writes an HTML report to
`e2e/report/`. `npm run e2e:ui` opens the same suite in the Playwright UI.

## How the stack fits together

```
npm run e2e
  -> Playwright webServer command: npx tsx e2e/start-web.ts
       1. ensureChainStack()  (e2e/stack.ts, idempotent)
            - hardhat node on 127.0.0.1:8545 (reused when already running,
              pid recorded in e2e/.pids/hardhat.pid, log in e2e/.pids/)
            - contracts/scripts/deploy_local.ts --network localhost with
              FUND_ACCOUNTS=10: mock USDC + Marketplace proxy, writes
              e2e/.chain.json (addresses + funded test private keys)
            - writes e2e/.env.chain from e2e/.chain.json
       2. loads e2e/.env.chain into process.env and starts
          `next dev -p 3100` with TEST_MODE=1, NEXT_PUBLIC_TEST_MODE=1
  -> Playwright global setup: e2e/global-setup.ts (runs AFTER the web server
     is up; Playwright starts webServer plugins before global setup)
       3. fails fast when SUPABASE_SERVICE_ROLE_KEY is missing/placeholder
       4. ensureChainStack() again (no-op; covers reuseExistingServer)
       5. verifies the seed wallet roster matches the funded chain accounts
       6. runs scripts/seed.ts (idempotent database seed)
       7. starts scripts/indexer.ts against http://127.0.0.1:8545 with a 2s
          poll (pid in e2e/.pids/indexer.pid, log in e2e/.pids/indexer.log)
  -> specs run against http://localhost:3100
  -> global teardown kills the indexer and the hardhat node by pid file
```

### Why the chain comes up inside the webServer command

Playwright launches the webServer BEFORE global setup runs, and `next dev`
needs the deployed contract addresses in its environment at boot. So
`e2e/start-web.ts` brings the chain up itself and "sources" `e2e/.env.chain`
by loading it into `process.env` before spawning `next dev` (process env wins
over `.env.local` inside Next, overriding the placeholder addresses committed
there). Global setup re-runs the same idempotent bring-up as a safety net.

### The env file mechanism

`e2e/.env.chain` (generated, gitignored) carries:

- `NEXT_PUBLIC_LOCAL_MARKETPLACE_ADDRESS` / `NEXT_PUBLIC_LOCAL_USDC_ADDRESS`
  (read by `src/config/contracts.ts` for the 31337 chain entry)
- `NEXT_PUBLIC_THIRDWEB_CONTRACT_ADDRESS` / `NEXT_PUBLIC_USDC_CONTRACT_ADDRESS`
  (env-first overrides read by `src/lib/thirdWebClient.ts` and the server
  actions; must point at the local deployment during e2e)
- `NEXT_PUBLIC_THIRDWEB_CHAIN_ID=31337`, `INDEXER_RPC_URL`

Addresses are deterministic (fresh hardhat node, deployer nonce 0), so the
file stays valid across full restarts of the stack.

## Wallet roster (the alignment that makes chain and db agree)

`e2e/wallets.ts` is the single source of truth: the standard hardhat dev
accounts in the order `contracts/scripts/deploy_local.ts` funds them.

| role      | hardhat account | notes                          |
| --------- | --------------- | ------------------------------ |
| admin     | 0               | also deployer + fee recipient  |
| business1 | 1               | verified business (seed)       |
| business2 | 2               | verified business (seed)       |
| investor1 | 3               | retail                         |
| investor2 | 4               | retail                         |
| investor3 | 5               | retail                         |

`scripts/seed.ts` imports this roster, so the users it creates in Supabase
ARE the funded on-chain accounts. `e2e/fixtures.ts` cross-checks the roster
against `e2e/.chain.json` at runtime and throws on drift.

## Fixtures (import from `e2e/fixtures.ts`)

```ts
import { expect, test } from '../fixtures';

test('example', async ({ page, request, walletFor, loginAs, sumsubApprove, chain, db }) => {
  const wallet = await loginAs(page, 'investor1');          // cookie + e2e_pk
  await sumsubApprove(request, wallet.address);             // signed GREEN webhook
  await chain.mineBlock();                                  // hardhat RPC
  await chain.increaseTime(3600);
  const user = await db().userByWallet(wallet.address);     // service-role client
});
```

- `loginAs` seeds `localStorage["e2e_pk"]` (the key
  `src/lib/wallet/testAccount.ts` reads, so the app signs transactions with
  the role's hardhat key) and POSTs `/api/test-auth` to set the
  production-equivalent session cookie.
- `sumsubApprove` signs the webhook body with `SUMSUB_WEBHOOK_SECRET` from
  `.env.local` (HMAC-SHA256, `x-payload-digest`), same as real Sumsub.
- The mock onramp provider is active because the server runs with
  `TEST_MODE=1`; a session created with fiat amount 13 fails after pending
  (`MOCK_FAIL_FIAT_AMOUNT` in `src/lib/onramp/mock.ts`), everything else
  completes. The provider redirect lands on `/onramp/mock`.
- `db()` throws a clear SKIP message while `SUPABASE_SERVICE_ROLE_KEY` is a
  placeholder (global setup fails fast on that anyway).

## Business journey spec (e2e/specs/business.spec.ts)

One serial chain covering the full BUSINESS journey: register (first
test-auth login creates the users row), complete profile, KYB via the signed
Sumsub webhook, draft listing (Watches category with string / number /
dropdown / document fields, image + document uploads from
`e2e/fixtures-data/`), draft edit, Coming soon card in the marketplace, mint
and list with a real on-chain transaction, dashboard sales view, listing
metadata + primary price update, delist, transaction history, settings
persistence.

Details worth knowing:

- The journey actor is hardhat account 6 (`e2e/specs/helpers/business.ts`):
  funded by the deploy (FUND_ACCOUNTS=10) but outside the seed roster, so
  registration is real and seeded users are never mutated.
- Business pages are served behind the business subdomain
  (`src/middleware.ts`), so the spec drives them on
  `http://business.localhost:3100`. The session cookie from
  `POST /api/test-auth` (main origin) is cloned onto that origin, because
  cookies are host-scoped. `*.localhost` resolves to loopback on modern
  macOS / Chromium; if `business.localhost` does not resolve on your machine,
  add it to /etc/hosts.
- Re-entrancy against the shared remote database: asset names are unique per
  worker run, the journey user is normalized at spec start (type business,
  RED webhook resets is_verified), and stale `minting` assets from crashed
  runs are parked as delisted before publishing so the indexer's
  oldest-minting-asset fallback cannot promote the wrong row.
- `e2e/fixtures-data/` holds the tiny upload fixtures (valid 8x8 PNGs and a
  one-page PDF). Uploads land in the remote Supabase storage buckets.

## Spec inventory and ordering

- `specs/00-harness.smoke.spec.ts` - stack self-checks (chain, app, webhook).
- `specs/system.spec.ts` - the SYSTEM guarantees, serial: (1) the indexer
  reconciles a purchase completed while the browser was closed (buy driven
  from node with viem, no orders row; the indexer must synthesize the settled
  `chain_direct` order, move holdings, decrement the listing, write the
  transactions rows), (2) two pre-signed concurrent buys for the last
  fractions where the chain reverts exactly one, plus a UI variant that parks
  the losing browser's buyFractions RPC until a rival lands the purchase and
  then asserts the buy flow renders the failure, (3) RLS: an
  `/api/rls-token` JWT for investor1 reads own holdings but zero rows for
  investor2, anon reads active listings and zero holdings. Each chain-heavy
  test mints its own fresh asset through the real contract; a cross-run
  hygiene pass neutralizes rows orphaned by a hardhat node reset
  (deterministic deploys reuse nft ids and token addresses across fresh
  nodes) and rewinds a stale indexer cursor.
- `specs/reconcile.spec.ts` - runs `scripts/reconcile-chain.ts` as a child
  process and requires exit 0 with zero unexplained diffs. It must run LAST:
  the config defines a `reconcile` project that matches only this file and
  depends on the `suites` project (everything else). Dependencies always run
  in full, so filtering a run to `reconcile.spec.ts` still executes the
  suites first, and a suites failure skips the reconcile gate.

The system specs sign transactions with viem (resolved from the root
node_modules, where it ships as a dependency of thirdweb v5) so tx hashes are
known before broadcast; order rows can then carry `tx_hash` in `submitted`
before the indexer can possibly observe the transaction.

## Required env (.env.local)

- `SUPABASE_SERVICE_ROLE_KEY` - REAL key for the remote Supabase project.
  Currently a placeholder; the suite refuses to start until it is set.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_JWT_SECRET` - remote project config, already present.
- `SUMSUB_WEBHOOK_SECRET` - any known value; app and fixtures read the same
  file so signatures always match.
- `AUTH_PRIVATE_KEY`, `NEXT_PUBLIC_THIRDWEB_AUTH_DOMAIN` - session JWT
  signing, already present.
- `NEXT_PUBLIC_THIRDWEB_CHAIN_ID=31337`, `TEST_MODE=1`,
  `NEXT_PUBLIC_TEST_MODE=1` - already present.
- Supabase migrations must be applied (seed needs the asset categories).

No Sumsub, thirdweb onramp, or exchange-rate credentials are needed: test
mode mocks all of them.

## Other scripts

- `npm run e2e:web` - the exact web server the suite uses (chain bring-up
  plus `next dev -p 3100` with the chain env), for manual poking. With
  `reuseExistingServer: true` a suite run will reuse it.
- `npm run chain:local` - just a hardhat node in the foreground.
- `npm run indexer:local` - the indexer loop in the foreground (uses
  `INDEXER_RPC_URL` / `INDEXER_POLL_MS` from the environment).

## Troubleshooting

- "SUPABASE_SERVICE_ROLE_KEY is missing or still placeholder": set the real
  key in `.env.local`.
- Port 8545 occupied but not answering `eth_chainId` with 31337: something
  else owns the port; free it (`lsof -i :8545`).
- Wallet roster mismatch errors: `e2e/.chain.json` was produced by an old
  deploy. Delete it (and `e2e/.env.chain`), kill the node
  (`kill $(cat e2e/.pids/hardhat.pid 2>/dev/null | sed -n 's/.*"pid": \([0-9]*\).*/\1/p')`
  or just `npx playwright test --list` then teardown), and rerun.
- Stale processes after a crash: pid files live in `e2e/.pids/`; setup cleans
  dead ones automatically, and `e2e/global-teardown.ts` logic runs on every
  suite end. Manual cleanup: `pkill -f "hardhat node"` and
  `pkill -f "scripts/indexer.ts"`.
- App boots but chain calls fail with address `0x000...000`: the dev server
  on 3100 was started outside `e2e/start-web.ts` and lacks the chain env.
  Stop it and let Playwright start its own, or use `npm run e2e:web`.
- The database is REMOTE and not reset between runs: the seed is idempotent,
  but settled orders/holdings from previous runs accumulate. Specs must
  assert on deltas or freshly created rows, not on absolute table state.
- Process logs: `e2e/.pids/hardhat.log`, `e2e/.pids/indexer.log`.
