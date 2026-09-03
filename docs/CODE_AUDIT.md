# Fractionaire Code Audit (Master)

Audit date: 2026-09-03. Target repo: `fractionaire/rwa_marketplace`, branch `feat/supabase-migration-onramp-e2e`, local checkout `/Users/gdbmood/Desktop/Fractionnaire/rwa_marketplace`. Seven parallel audits; detailed sections live in [docs/audit/](audit/) and are linked in section 8. This document summarizes and links, it does not repeat full detail.

---

## 1. Executive summary

**What it is.** A client-heavy Next.js 15 RWA fractionalization marketplace: MUI v6 UI, thirdweb v5 for wallet auth (SIWE) and contract calls, Firebase (Firestore + Storage) accessed directly from the browser, Sumsub for KYC/KYB, a single upgradeable Marketplace contract on Base (USDC settlement). The target repo's source is byte-identical to the legacy DesertTech frontend; git history was not preserved. The smart contract source is not in this repo at all.

**What runs today.** Almost every retail and business happy path has wired UI and works end to end: register, KYB, create listing, mint and fractionalize, dashboard, price update, browse, filter, asset detail, buy (with thirdweb PayEmbed funding fallback), portfolio, sell, update listing, unlist, history, settings, multi-currency display. Jest passes (72 tests), the production build is green with env set, and the contracts repo compiles with 14/14 tests passing. All 7 frontend ABI fragments exactly match the compiled contract. The legacy public deployment is up and healthy at desert-tech-rwa-marketplace.vercel.app.

**What is broken.** The server side is the problem. Three critical holes: the Sumsub webhook accepts unauthenticated POSTs, so anyone can grant themselves KYC or business verification; the purchase settlement server action is unauthenticated, verifies nothing on-chain, and mutates listings, holdings, and supply non-transactionally with admin rights; the KYC session route decodes the JWT without verifying its signature, so forged tokens mint Sumsub sessions for any wallet. The session cookie has no HttpOnly/Secure/SameSite flags, a third-party API key is hardcoded in source, and all economic Firestore writes (mint, sell, unlist, transfer, buy records) happen in the browser with no Firebase Auth user, secured only by rules that are not in the repo. Transfer writes its Transaction record with from/to inverted and dilutes average entry price incorrectly. Typecheck and lint fail on a fresh clone. No page has server-enforced authorization.

**What is missing.** Business delist (no UI, no contract call, `ListingState.CANCELED` never used). Revenue distribution (`depositRevenue` exists on the contract but is absent from the frontend ABI, and the creator's share leaks to the platform owner). Server-side route authorization. Event-based chain indexing (no events for sell/unlist/update, no nftId on buy events). Any deployment pipeline for the target repo (never deployed, no CI, no Vercel link). Operational control of the live site and domains (they sit in outside accounts). Seed data for asset categories (the 16 classes in `src/constants.ts` are dead code; runtime schemas live only in production Firestore). No admin surface of any kind. No Supabase vars, schema, or code yet: the migration starts from zero.

---

## 2. Journey status table

Frontend per-journey calls merged with backend, Firestore, and contract findings. Status reflects whether the journey functions for a legitimate user; security caveats are noted inline.

### Business journeys

| Journey | Status | Evidence |
|---|---|---|
| Register | WORKS | Wallet connect creates BusinessUser via login action (`src/actions/login.ts:31-45`); defect: shared navbar registers business users as retail (`src/components/navbar.tsx:89`), stranding them at the dashboard gate |
| Profile | WORKS | Shared `/profile` branches on hostname; KYB badge, editable fields (`src/app/profile/page.tsx:40-63`); no logo upload UI despite logo rendering on cards |
| KYB verification | WORKS | Sumsub flow end to end (`src/app/business/verify-business/page.tsx:25`, webhook sets isVerified); caveat: webhook is unauthenticated and the session route trusts an unverified JWT, see Platform rows below |
| Create listing | WORKS | Schema-driven form with media/document dropzones and validation (`src/app/business/list-new-asset/page.tsx:111-163`) |
| Mint and fractionalize | WORKS | createListing on-chain then Asset/Listing/KYCRequirement/Mint Firestore writes (`src/components/assets/list-modal.tsx:148-199`); defect: new NFT resolved as `nfts[length-1]`, a race under concurrent mints |
| Dashboard | WORKS | Cards, chips, metrics, explorer links (`src/app/business/dashboard/page.tsx:121-221`); table pagination is dead, no empty state |
| Update price | WORKS | Minter-only update page, contract call plus Firestore sync (`src/app/asset/[saleId]/update/page.tsx:286-291`) |
| Delist own listing | MISSING | No screen, button, or contract call; only retail-holding unlist exists; `ListingState.CANCELED` never written (`src/types/Listing.ts:3`) |

### Investor journeys

| Journey | Status | Evidence |
|---|---|---|
| Register | WORKS | Implicit via ConnectButton/auto-connect; first login creates RetailUser doc (`src/actions/login.ts:36-45`) |
| Browse marketplace | WORKS | Category grid to per-class pages (`src/app/marketplace/page.tsx:38-46`); no loading or empty state |
| Filter and search | WORKS | Name search, price sort, per-field filters generated from Firestore category schema (`src/app/marketplace/[assetClass]/page.tsx:60-112`) |
| Asset detail | WORKS | Full detail, listings table, KYC eligibility, buy (`src/app/asset/[saleId]/page.tsx`); defect: unknown saleId crashes to a permanent spinner instead of redirecting (`:138-140`) |
| Asset documents tab | BROKEN | Only the first documentUrls group is read, marked `// Fixme:` (`src/app/asset/[saleId]/docs/page.tsx:53`) |
| Buy fractions | WORKS | Approve + buyNFT, PayEmbed funding fallback, KYC gating (`src/app/asset/[saleId]/page.tsx:236-274`); caveat: server settlement behind it is BROKEN, see Platform rows |
| Portfolio | WORKS | Performance stats and per-holding cards from Holding docs, chain NFTs, Transaction docs (`src/app/portfolio/page.tsx:168-252`) |
| Sell (list fractions) | WORKS | Quantity slider, approve + sellNFT, Listing creation, lockedQuantity increment (`src/app/portfolio/[purchaseId]/page.tsx:171-198`) |
| Update own listing | WORKS | unlistNFT then sellNFT at new price plus Firestore sync (`src/app/portfolio/[purchaseId]/[listingId]/page.tsx:124-150`) |
| Unlist | WORKS | unlistNFT then Listing delete and counters decrement (`src/app/portfolio/page.tsx:254-272`) |
| Transfer fractions | BROKEN | ERC20 transfer succeeds but the Transaction record inverts fromWallet/toWallet (`src/components/assets/transfer-modal.tsx:86-87`) and the averageEntryPrice dilution formula ignores transferred value (`:70`); assetCategory stored as name, not id |
| Trading history | WORKS | Merges both-direction Transaction docs, dedupes, sorts (`src/app/portfolio/page.tsx:171-179`); no loading or empty state |
| Settings | WORKS | Language, currency, notifications, dark mode auto-saved to user doc (`src/app/settings/page.tsx:76-89`); write failures only console.error |
| Currency display | WORKS | USD/EUR/AED conversion on totals via server action (`src/actions/currency-rate.ts`); API key hardcoded at `:15` |

### Platform and server journeys

| Journey | Status | Evidence |
|---|---|---|
| Wallet login (SIWE, JWT cookie) | WORKS | `src/actions/login.ts:24-56`; cookie lacks HttpOnly/Secure/SameSite, userType is client-controlled |
| KYC session creation (Sumsub token) | BROKEN | Unverified `jose.decodeJwt` (`src/app/api/create-verification-session/route.ts:76`): forged JWTs mint sessions for arbitrary wallets; shared mutable axios config races across concurrent users |
| KYC result ingestion (webhook) | BROKEN | `src/app/api/sumsub-webhook/route.ts:5-31` accepts unauthenticated POSTs, no x-payload-digest HMAC check, no RED/reset handling; full KYC bypass |
| Purchase settlement (server) | BROKEN | `src/actions/purchase-success.ts:9-66`: no auth, no on-chain verification, no transaction or idempotency, fire-and-forget from the browser; availableSupply decremented even when listings cannot cover quantity |
| Server-enforced authorization | MISSING | No server component or middleware gates any page; all access control is client-side against client-readable Firestore; business host routing is a spoofable Host substring match (`src/middleware.ts:10-24`) and 3 of 6 rewritten paths 404 |
| Revenue distribution (depositRevenue) | MISSING | Exists on the contract (`Marketplace.sol:421-460`) but absent from `src/utils/ABI.ts`; creator excluded from holderList so their share leaks to the platform owner |
| Event-based chain indexing | BROKEN | No events for sellFractions/unlistFractions/updateListing; FractionBought and RoyaltyDistributed carry the ERC20 address, not nftId; frontend ABI contains zero event fragments |

Counts: 19 WORKS, 6 BROKEN, 3 MISSING (28 rows).

---

## 3. Build health

Full detail: [audit/build-health.md](audit/build-health.md).

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | FAIL on fresh clone (exit 2): TS2307 on the svg import at `src/components/landing-page/footer.tsx:3`, caused by gitignored `next-env.d.ts` not existing yet. PASS (exit 0) after `next build` regenerates it. CI ordering trap |
| Lint | `npm run lint` | FAIL (exit 1): eslint and eslint-config-next are not in devDependencies, no eslint config exists, `next lint` drops into an interactive setup prompt |
| Unit tests | `npx jest --ci` | PASS (exit 0): 7 suites, 72 tests, 1.5 s. Coverage 4.15 percent statements: pure utils, two zustand stores, two trivial components. Zero coverage on routes, API routes, server actions, middleware, firebase/thirdweb libs |
| Build, no env | `npm run build` | FAIL (exit 1) at Collecting page data: "clientId or secretKey must be provided" from the module-scope `createThirdwebClient` at `src/lib/thirdWebClient.ts:6-8` |
| Build, placeholder env | `npm run build` | PASS (exit 0): 20 routes, 13/13 static pages, no warnings. No env value except the thirdweb id/secret is validated at build time (firebase-admin initializes lazily), so bad secrets build green and fail at runtime |

First Load JS is 720 to 792 kB on most product pages (baseline 120 kB). `k6-result.txt` records a passing 500-VU, 14-minute load test (p95 1.26 s, 0 percent failures) with no target URL, date, or script in the repo.

---

## 4. Environment variables

Full detail: [audit/env-config.md](audit/env-config.md). 17 vars referenced in code.

**Client-exposed (NEXT_PUBLIC_, inlined into the browser bundle), 13:**
`NEXT_PUBLIC_THIRDWEB_CLIENT_ID`, `NEXT_PUBLIC_THIRDWEB_CHAIN_ID`, `NEXT_PUBLIC_THIRDWEB_CONTRACT_ADDRESS`, `NEXT_PUBLIC_THIRDWEB_AUTH_DOMAIN`, `NEXT_PUBLIC_USDC_CONTRACT_ADDRESS`, `NEXT_PUBLIC_BLOCKCHAIN_EXPLORER_URL`, `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`, `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`

**Server-only, 6:**
`AUTH_PRIVATE_KEY`, `THIRDWEB_SECRET_KEY`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `SUMSUB_TOKEN`, `SUMSUB_SECRET_KEY`

**Discrepancies:**
- `NEXT_PUBLIC_THIRDWEB_AUTH_DOMAIN` is used (`src/actions/login.ts:19`) but MISSING from `.env.example`; falls back silently to an empty SIWE domain.
- `JWT_SECRET` is in `.env.example` but referenced nowhere; dead config (JWTs come from thirdweb auth via `AUTH_PRIVATE_KEY`).
- A hardcoded exchangerate-api key (`728eda2f8fc18ac492f2b410`) is committed in `src/actions/currency-rate.ts:15` instead of being an env var. Rotate it.
- No Supabase vars exist anywhere; `.env.example` is byte-identical to the legacy repo copy.
- Almost every env read uses a non-null assertion with no runtime validation; only `AUTH_PRIVATE_KEY` and the firebase-admin quartet fail fast. `next.config.ts` allows image hostname `**` (open image-optimizer proxy).

---

## 5. Deployment state

Full detail: [audit/deploy-state.md](audit/deploy-state.md).

**What the Vercel MCP could see:** the Moods account (single team `moods`, `team_LrSHE3MDpIVHX6AU7h39dlum`, pro plan) and its 50 projects. None match rwa, fraction, desert, or marketplace. `get_deployment` for `desert-tech-rwa-marketplace.vercel.app` scoped to that team returns 404 not_found.

**What it could not see:** the production project. It lives on an outside Vercel account, almost certainly Desert Tech's (legacy remotes are `github.com/DesertTechProjects`, and the hostname carries the desert-tech scope). Moods has zero operational control: no redeploy, rollback, logs, env, or domain management.

**Public URLs:**
- `https://desert-tech-rwa-marketplace.vercel.app`: UP, HTTP 200, Next.js on Vercel, serving the full Fractionnaire app (`/`, `/marketplace`, `/portfolio` all 200), but frozen at the legacy repo's last commit (2025-09-01).
- `fractionnaire.com` and `fractionaire.com`: GoDaddy parking pages, no app. Both expire 2026-11-16, about ten weeks out. `www.fractionnaire.com` fails TLS (unrecognized name).
- The target repo has never been deployed: no `.vercel/`, no `vercel.json`, no `.github/` CI, no code references to the old URL or domains.

Open ownership questions: who controls the Desert Tech Vercel account and the GoDaddy account; whether the stale public legacy site gets taken down or redirected at cutover; which domain spelling (double-n vs single-n) is canonical.

---

## 6. Legacy repo inventory

Legacy clones live at `/Users/gdbmood/Desktop/Fractionnaire/legacy/`. See also `MIGRATION_NOTES.md` (Phase 0 repo table).

| Repo | What it is | In target already? | Valuable and not yet migrated |
|---|---|---|---|
| `DesertTechProjects/rwa_marketplace` (legacy frontend) | The Next.js 15 app, full git history | YES, content: `src/`, `public/`, and configs are byte-identical to the target (`diff -rq` clean outside `.git` and generated dirs). NO, history: the fractionaire copy has 2 commits ("first commit", "."), history lost; `.gitignore` and `.env.example` were dropped in the copy and restored on this branch | Full git history (blame, the fee-collector rewrite context); the k6 load-test script referenced by `k6-result.txt` exists in neither copy |
| `DesertTechProjects/rwa_marketplace_smartcontracts` | Hardhat 2.23 project: `Marketplace.sol` (upgradeable, transparent proxy), `BaseNFT.sol`, `ERC20Token.sol`; compiles clean, 14/14 tests pass | NO. Not present in the target repo at all; `fractionaire/rwa_marketplace_smartcontracts` is a placeholder shell with one Initial commit. Only 7 hand-copied ABI fragments exist in target `src/utils/ABI.ts` (exact matches, but no events, no depositRevenue) | Everything: contract source, deploy/upgrade scripts (`scripts/deploy_upgradeable_marketplace.ts`, `upgrade_marketplace.ts`), the full compiled ABI with events, tests, typechain types, and the `.openzeppelin/` manifests recording every proxy and implementation address, including an undocumented Base MAINNET proxy `0x511B10f9fD7d95738E372757EF85FB8a0c290f0E`. Plan: mirror push to the fractionaire shell and vendor contracts into this repo |
| `DesertTechProjects/Readmeintro` | Org-level README describing the FE/BE/SC/Testing structure | NO. `fractionaire/Readmeintro` is a placeholder shell | The README itself (trivial); mirror push pending |

Cross-cutting inventory notes: no repo, legacy or target, has any CI. Firestore seed data is a migration dependency, not a repo artifact: the `AssetCategory` collection (plus `fields` subcollections) and `BusinessUser.logo` have no write path in any repo and exist only in the production Firebase project, so a data export is required. The 16 asset classes in `src/constants.ts` are dead code (only the `FieldType` type is imported); do not mistake them for the live schema.

---

## 7. Gap analysis per journey (what must be built)

Mission workstreams: Supabase migration, chain indexer, fiat on-ramp, draft listings, order entity, admin surface.

**Supabase migration (touches every journey).**
- Replace ~60 Firestore call sites (all one-shot gets/writes, no listeners, no pagination, so plain selects and RPCs suffice). Map: RetailUser, BusinessUser, Asset, Asset/Listing, Asset/KYCRequirement, RetailUser/Holding, RetailUser/KYCIdentity, Transaction, Mint, AssetCategory(+fields).
- Move every economic browser write (mint, sell, unlist, transfer, buy records, profile, settings) behind server-side RPC with RLS; today they run with no auth user against client-writable Firestore.
- Convert 8 `FieldValue.increment` sites to atomic SQL; wrap the purchase flow's split browser/server writes in one transaction with idempotency keys.
- Normalize types: assetId number vs string doc id (parseInt bridge in `purchase-success.ts:39`), assetCategory id vs display name, Timestamp vs ISO string createdAt, KYC boolean-flag subcollections become boolean columns, `fullName` vs `name` on RetailUser.
- Export AssetCategory(+fields) and BusinessUser.logo from production Firestore; nothing in any repo seeds them.
- Storage: existing `firebasestorage.googleapis.com` download URLs are pinned inside on-chain NFT metadata, so they must stay resolvable or be proxied; the update page parses storage paths back out of those URLs.
- Auth hardening rides along: HttpOnly/Secure/SameSite cookie, verify JWTs (the Sumsub route currently does not), server-set userType, Sumsub webhook HMAC verification, remove the hardcoded currency API key, add env validation, add Supabase vars to `.env.example`.

**Chain indexer (portfolio, history, dashboard, marketplace freshness).**
- The current contract cannot support a pure event indexer: no events for sellFractions/unlistFractions/updateListing, FractionBought and RoyaltyDistributed carry the ERC20 token address instead of nftId, and no per-fill seller detail is emitted. An indexer must build an erc20Token to nftId map from NFTFractionalized and poll `fetchAllListings` for the rest (which itself omits the resale order book, and there are no getters for resales/holderList/feeRecipient).
- The frontend ABI has zero event fragments; the indexer needs the full compiled ABI from the contracts repo.
- Confirm which proxy production points at: the README-documented Sepolia proxy returns an 8-field tuple that mis-decodes with the current 7-field ABI; the mainnet proxy matches current source. `NEXT_PUBLIC_THIRDWEB_CONTRACT_ADDRESS` is not in the repo.
- If a contract upgrade is in scope, add the missing events (and fix creator holderList, fee cap, escrow) rather than teaching the indexer to poll.

**On-ramp (investor buy).**
- Today's funding path is thirdweb PayEmbed with same-chain-only Bridge quotes (origin equals destination chain at the buy page). A real fiat on-ramp needs a provider integration plus webhook-driven settlement.
- Settlement must move server-side: verify the on-chain tx before writing anything (the current `purchaseSuccessOnBlockchain` verifies nothing), and stop trusting client-supplied prices, fees, and tx hashes.

**Draft listings (business create/mint).**
- Creation is currently one-shot: form straight to on-chain mint plus four Firestore writes. Build a draft entity (Supabase) with save/resume and review before mint; bind the minted NFT id from the mint result instead of `nfts[length-1]` (race).
- Business delist must be built from scratch: UI, unlist contract call for the issuer, and a real CANCELED state.

**Order entity (buy, sell, transfer, history).**
- Introduce an orders table with explicit states (created, funded, on-chain pending, settled, failed) replacing the fire-and-forget split writes. Gives idempotency, reconciliation against chain state, and a correct Transaction ledger (fixing the inverted transfer records and the `Transaction.listingId` field that actually stores an Asset id).

**Admin surface (note).**
- None exists anywhere: no admin UI, contract admin functions (pause, setPlatformFee, setFeeRecipient, withdraw) are absent from the frontend ABI, category schemas are seeded by hand in Firestore, and KYC state can only be flipped by the (unauthenticated) webhook. At minimum the mission needs an admin surface for category/schema management, KYC overrides and review, fee configuration, and listing moderation/delist. Flagged here as scope; not designed in this audit.

**Also worth scheduling (journey defects that survive the migration if untouched):** business users registered as retail by the navbar, 404s on 3 of 6 business-host paths, dead `/login` redirect after logout, unknown-saleId crash, docs tab reading only the first document group, dead table pagination, missing route-level loading/error/not-found states, revenue distribution frontend (plus the creator holderList contract fix).

---

## 8. Detailed section files

| Section | File |
|---|---|
| Frontend (routes, state, journeys, UX states) | [docs/audit/frontend.md](audit/frontend.md) |
| Backend (server actions, API routes, auth, middleware) | [docs/audit/backend.md](audit/backend.md) |
| Firestore usage map (collections, call sites, migration hazards) | [docs/audit/firestore-usage.md](audit/firestore-usage.md) |
| Smart contracts (ABI diff, events, deployments, risks) | [docs/audit/contracts.md](audit/contracts.md) |
| Build health (typecheck, lint, tests, build, bundle) | [docs/audit/build-health.md](audit/build-health.md) |
| Env and config (vars, theme, constants, jest setup) | [docs/audit/env-config.md](audit/env-config.md) |
| Deployment state (Vercel access, live URLs, domains) | [docs/audit/deploy-state.md](audit/deploy-state.md) |
