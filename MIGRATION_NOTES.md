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
| fractionaire/rwa_marketplace | Target. Content matches legacy frontend but history was NOT preserved (2 commits: "first commit", "."). Missing `.gitignore` and `.env.example` (restored in this branch). A `.DS_Store` was committed (removed in this branch). |
| fractionaire/rwa_marketplace_smartcontracts | Placeholder shell, single "Initial commit" (2026-07-24), no real content. Needs mirror push from legacy in Phase 3. |
| fractionaire/Readmeintro | Placeholder shell, single "Initial commit" (2026-07-24). Needs mirror push from legacy in Phase 3. |

### Findings

1. The fractionaire copy of the frontend was pushed without git history and lost `.gitignore` and `.env.example`. Both files restored on this branch from the legacy repo.
2. The smart contract source lives only in `DesertTechProjects/rwa_marketplace_smartcontracts`. Plan: mirror push into the `fractionaire` shell repo (history preserved) and vendor the contracts into `contracts/` in this repo per the mission brief.
3. Docker is unavailable on this machine, so `supabase start` (local stack) is not possible. Schema work targets a remote Supabase project through the Supabase MCP, with migrations checked into `supabase/migrations/`.

## Repo migration map (Phase 3)

To be filled during Phase 3.

| Old | New | Method | Status |
|---|---|---|---|
| DesertTechProjects/rwa_marketplace | fractionaire/rwa_marketplace | Already copied by customer (history lost, see Findings) | Pre-existing |
| DesertTechProjects/rwa_marketplace_smartcontracts | fractionaire/rwa_marketplace_smartcontracts | Mirror push planned | Pending |
| DesertTechProjects/Readmeintro | fractionaire/Readmeintro | Mirror push planned | Pending |
