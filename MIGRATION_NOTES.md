# Fractionaire Migration Notes

Living log of the Supabase migration, on-ramp, and production readiness work.
Branch: `feat/supabase-migration-onramp-e2e` on `fractionaire/rwa_marketplace`.

## Phase 0: Setup (2026-09-03)

### Toolchain

| Tool | Status |
|---|---|
| gh CLI | Authenticated as `gdbmood` (scopes: gist, read:org, repo, workflow) |
| node | v25.6.1 |
| npm | 11.9.0 |
| docker | MISSING (no local Supabase stack; using remote Supabase via MCP and `npx supabase` for migrations) |
| supabase CLI | MISSING globally (using `npx supabase` where needed) |
| ffmpeg | 9.0.1 (available for demo video conversion) |

### Repos

| Org / repo | State |
|---|---|
| DesertTechProjects/rwa_marketplace | Legacy frontend, full history, cloned read only to `legacy/rwa_marketplace` |
| DesertTechProjects/rwa_marketplace_smartcontracts | Hardhat project (contracts, tests, scripts, typechain), cloned to `legacy/rwa_marketplace_smartcontracts` |
| DesertTechProjects/Readmeintro | Org readme intro, cloned to `legacy/Readmeintro` |
| fractionaire/rwa_marketplace | Target. Content matches legacy frontend but history was NOT preserved (2 commits: "first commit", "."). Missing `.gitignore` and `.env.example` (restored in this branch). |
| fractionaire/rwa_marketplace_smartcontracts | Placeholder shell, single "Initial commit" (2026-07-24), no real content. Needs mirror push from legacy in Phase 3. |
| fractionaire/Readmeintro | Placeholder shell, single "Initial commit" (2026-07-24). Needs mirror push from legacy in Phase 3. |

### Findings

1. The fractionaire copy of the frontend was pushed without git history and lost `.gitignore` and `.env.example`. Both files restored on this branch from the legacy repo.
2. The smart contract source lives only in `DesertTechProjects/rwa_marketplace_smartcontracts`. Plan: mirror push into the `fractionaire` shell repo (history preserved) and vendor the contracts into `contracts/` in this repo per the mission brief.
3. Docker is unavailable on this machine, so `supabase start` (local stack) is not possible. Schema work targets a remote Supabase project through the Supabase MCP, with migrations checked into `supabase/migrations/`.

## Phase 1: Knowledge extraction (2026-09-03)

docs/PRODUCT_KNOWLEDGE.md written from the full DesertTech Notion teamspace (9 pages
plus 5 targeted searches, 14 parallel readers). Key answers: Supabase appears in the
2026 agreements as the delivered application database (planning docs said Firebase);
chain is Base (mainnet proxy exists, QA on Base Sepolia); on-ramp decision page is
blank, operative spec is thirdweb Pay with fallback; listings auto-list after mint
with a pending approval status kept for a future gate; Notion is silent on draft
listings (mission brief mandates them, so they are built).

## Phase 2: Code audit (2026-09-03)

docs/CODE_AUDIT.md plus seven detail files in docs/audit/. Highlights: 19 of 28
journeys work, 6 broken, 3 missing. Critical security defects recorded (open Sumsub
webhook, unauthenticated purchase settlement, unverified JWT decode in the KYC
route, browser-side economic writes). Build green only with placeholder env vars,
lint broken (eslint not installed), jest 72 tests at 4 percent coverage.

## Phase 3: Repo migration (2026-09-03, done)

| Old | New | Method | Status |
|---|---|---|---|
| DesertTechProjects/rwa_marketplace | fractionaire/rwa_marketplace | Copied earlier by customer (history lost, dotfiles restored on this branch) | Pre-existing |
| DesertTechProjects/rwa_marketplace_smartcontracts | fractionaire/rwa_marketplace_smartcontracts | git clone --mirror, git push --mirror (full history preserved) | Done 2026-09-03 |
| DesertTechProjects/Readmeintro | fractionaire/Readmeintro | git clone --mirror, git push --mirror (full history preserved) | Done 2026-09-03 |

Contract source vendored into contracts/ (compiles, 14 of 14 hardhat tests pass).
Deployed addresses per chain committed to src/config/contracts.ts, including the
Base mainnet proxy 0x511B10f9fD7d95738E372757EF85FB8a0c290f0E and the current-layout
Base Sepolia proxy 0x27De872d3E546Db2157e516C10d9C7bDBed03Aa3. The README-era Sepolia
proxy 0x7FfF3162... has an incompatible 8 field tuple layout and is recorded under
LEGACY_DEPLOYMENTS, do not point the app at it.

## Phase 4: Supabase (2026-09-03, in progress)

Supabase project created after user approval: name Fractionaire, ref
ghvetmhejqjhyswldwdn, org MGS Projects, region eu-central-1, 10 USD per month.
URL: https://ghvetmhejqjhyswldwdn.supabase.co

Migrations in supabase/migrations/ (applied via Supabase MCP):
1. 20260903000001_initial_schema: enums, 11 tables, triggers, indexes.
2. 20260903000002_rls_policies: RLS on everything, read-only client model.
3. 20260903000003_views: v_marketplace, v_portfolio, v_business_dashboard.
4. 20260903000004_storage: asset-images and asset-documents buckets.
5. 20260903000005_seed_asset_categories: the 16 asset classes from constants.ts.
6. 20260903000006_business_profiles_and_hardening: public business profile table,
   invoker-only views, trigger function EXECUTE revoked (advisor fixes).

User decisions recorded:
- Supabase project creation approved (10 USD per month).
- Vercel preview skipped; the Vercel smoke test moves to Known gaps, deployment
  is documented in the runbook for whoever owns the production Vercel account.
- Database is recreated from zero, no Firestore production data migration. The
  Firestore migration script is still delivered for completeness but the seed
  path is the primary route.

## Phases 4 to 7: Implementation (2026-09-03, code complete)

Delivered by six parallel workstreams plus integration, all green (tsc 0 errors,
lint passing, jest 161+ tests passing, next build 15 of 15 pages):

- Server actions rewritten on the repository layer with requireUser and the
  Result contract; session cookie hardened (HttpOnly, Secure, SameSite).
- Sumsub webhook now verifies the x-payload-digest HMAC; KYC session route uses
  verified JWTs (decodeJwt eliminated); is_verified flips on GREEN, revokes on RED.
- The unauthenticated purchaseSuccessOnBlockchain action is gone; settlement is
  owned by the chain indexer (src/lib/indexer), idempotent on (tx_hash, log_index),
  with fetchAllListings polling for primary listing truth, vercel.json crons,
  /api/chain-webhook for thirdweb Insight, and scripts/indexer.ts for local runs.
- scripts/reconcile-chain.ts (holdings vs balanceOf, primary listings vs
  fetchAllListings), scripts/seed.ts (deterministic, idempotent),
  scripts/migrate-firestore-to-supabase.ts (dry run capable, delivered although
  the user chose recreate from zero).
- On-ramp behind an OnrampProvider interface. Research finding recorded in
  docs/architecture/ONRAMP.md: thirdweb's payments FAQ lists the UAE as an
  unsupported region, while Transak advertises UAE and AED support. The user
  accepted Transak with EUR or USD, so Transak is now FULLY IMPLEMENTED
  (src/lib/onramp/transak.ts, verified against live Transak docs, 31 unit
  tests) and is the default provider via ONRAMP_PROVIDER. It activates once a
  Transak partner account exists (checklist in ONRAMP.md). thirdweb
  Bridge.Onramp remains available behind the same interface; the mock provider
  serves test mode.
- Frontend fully off Firebase (packages removed): drafts and Coming soon cards,
  buy flow with USDC and card tabs and full order state machine UI, business
  dashboard sales view, portfolio, transfer, KYC gating, loading, empty and
  error states, all inside the existing MUI theme.
- Firebase deleted: firebaseClient.ts, firebaseServer.ts, firebase, firebase-admin,
  react-firebase-hooks all removed; eslint reinstated and passing.
- Migration 8 (indexer_cursors) applied; generated types refreshed.

Credentials: SUPABASE_SERVICE_ROLE_KEY and SUPABASE_JWT_SECRET were retrieved
from the dashboard with the user's authorization on 2026-09-03 and live only in
the gitignored .env.local. The complete production credential inventory (thirdweb,
Sumsub production keys and webhook secret, Transak partner keys, exchange rate
API key, indexer RPC, cron secret) is documented in .env.example and in the
handover document section 6; Med obtains those, see docs/handover/HANDOVER.md.
Test mode (local hardhat chain, test login, mock onramp) keeps the e2e suite
independent of all of these; see docs/architecture/IMPLEMENTATION_PLAN.md.

## Phases 8 to 11: Verification, demos, handover, PR (2026-09-03, done)

Verification, all on the committed branch:
- typecheck clean, lint passing (warnings only), 167 of 167 unit tests, clean
  production build from an empty .next.
- Playwright suite: 37 of 37 passing in one run (3.4 minutes), covering every
  business and investor function plus the three system guarantees, finishing
  with the chain reconciliation gate reporting zero unexplained diffs.
- Two root causes fixed during stabilization, both recorded because they matter
  for whoever runs the suite next:
  1. The suite now serves a production build (.next-e2e) instead of next dev.
     On-demand compilation was putting 13 to 41 second delays inside test
     timeouts (measured on the on-ramp webhook and status routes), which made
     the run flaky and aborted later serial tests. Runtime dropped from about
     17 minutes to under 4. E2E_DEV=1 restores the dev server.
  2. HARDHAT_PRIVATE_KEYS[4] in contracts/scripts/deploy_local.ts was corrupted
     and derived the wrong address, so investor2 signed from an unfunded
     account ("balance is: 0"). All ten keys are now verified against their
     addresses, and the deploy asserts the pairing so this fails loudly.

Phase 9: 31 demo videos in docs/demos (3.2 MB, committed directly, no Storage
upload needed) plus docs/demos/INDEX.md. Recorded by playwright.demo.config.ts
at 400 ms slow motion against the real stack; only passing takes are converted.
The walkthrough (00-full-journey.mp4) runs the whole product in one continuous
clip: business registers, verifies, drafts, mints and lists; investor buys with
a card through the on-ramp and resells by undercutting the primary listing; a
second investor buys the resale.

Phase 10: docs/FRACTIONAIRE_RELEASE_HANDOVER.pdf, 16 pages, rendered from
docs/handover/HANDOVER.md by scripts/make-handover-pdf.ts (mermaid diagrams as
real SVG, guards that fail the render on raw markdown or an em dash). Video
links wired in by scripts/link-demos-in-handover.ts, which fails if any
placeholder is left unmatched.

Correction recorded during this phase: "buy with another token via swap" is NOT
implemented. The checkout shows a Swap tab stating it is coming soon. It never
worked in the legacy app either, where the token picker was commented out and
its Bridge.Buy branch was unreachable. Documented in the handover, section 9
item 10, with the implementation sketch and the reason it was not built blind
(thirdweb Bridge has no local chain support, so it could not have been
verified here).

Phase 11: PR opened at https://github.com/fractionaire/rwa_marketplace/pull/1
(316 files, +56463, -13207). The source branch lives on the fork
gdbmood/rwa_marketplace because this account has read-only access to
fractionaire/rwa_marketplace; the mirror pushes to the other two fractionaire
repos succeeded because push is granted on those. Not merged, as instructed.
