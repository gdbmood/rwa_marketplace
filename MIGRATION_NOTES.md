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

Credentials still needed from the user (requested, not yet supplied):
- SUPABASE_SERVICE_ROLE_KEY and SUPABASE_JWT_SECRET (dashboard, project settings).
- NEXT_PUBLIC_THIRDWEB_CLIENT_ID and THIRDWEB_SECRET_KEY (thirdweb dashboard).
- SUMSUB_TOKEN and SUMSUB_SECRET_KEY (Sumsub sandbox).
Test mode (local hardhat chain, test login, mock onramp) keeps the e2e suite
independent of all of these; see docs/architecture/IMPLEMENTATION_PLAN.md.
