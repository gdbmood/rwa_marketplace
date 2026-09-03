# Frontend Audit (rwa_marketplace, Next.js 15 App Router)

Audit date: 2026-09-03. Scope: `/Users/gdbmood/Desktop/Fractionnaire/rwa_marketplace/src`. Status labels reflect code presence and apparent wiring only, the UI was not executed.

## 1. Stack summary

- Next.js 15.1.7, React 19, App Router, almost every page is a `"use client"` component (`package.json:26-34`).
- UI: MUI v6 with a large custom palette and two custom breakpoints `verticalTablet` and `horizontalTablet` (`src/theme.ts`), Tailwind is installed but only used incidentally (a few `className` strings, e.g. `src/app/marketplace/[assetClass]/page.tsx:137`).
- Data: Firebase Firestore direct from the browser (`src/lib/firebaseClient.ts`), Firebase Admin in server actions and API routes (`src/lib/firebaseServer.ts`), on-chain reads and writes through thirdweb v5 (`src/lib/thirdWebClient.ts`, `src/utils/ABI.ts`).
- Auth: thirdweb in-app smart wallet plus SIWE-style JWT cookie via server actions (`src/actions/login.ts:24-72`). Registration is implicit: the `login` action creates the `RetailUser` or `BusinessUser` Firestore doc on first sign-in (`src/actions/login.ts:36-45`).
- KYC/KYB: Sumsub WebSDK on `/verify` and `/business/verify-business`, session token minted by `/api/create-verification-session`, results written by `/api/sumsub-webhook`.
- State: 4 zustand stores (section 4).
- Theme: dark/light via MUI `useColorScheme`, default dark (`src/app/layout.tsx:36-39`), toggled in Settings (`src/app/settings/page.tsx:212-217`).

## 2. Route tree (src/app)

### Shared / retail routes

| Route | File | Purpose |
|---|---|---|
| `/` | `src/app/page.tsx` | Marketing landing page (navbar, hero with live top-4 listing cards fetched server side in `src/components/landing-page/hero-section.tsx:16-38`, highlights, about, content, footer). |
| `/marketplace` | `src/app/marketplace/page.tsx` | Category grid; each card routes to `/marketplace/{categoryName}` (`:40`). |
| `/marketplace/[assetClass]` | `src/app/marketplace/[assetClass]/page.tsx` | Listing browser for one asset class: search, price sort, per-field filters built from the category field schema (`:227-287`), paginated cards. |
| `/asset/[saleId]` | `src/app/asset/[saleId]/page.tsx` | Asset detail: image carousel, issuer link, docs link, KYC eligibility table, secondary listings table, fraction slider, subtotal in fiat and USDC, BUY (approve + `buyNFT`), and an "Update asset data" button visible to the minter (`:685`). |
| `/asset/[saleId]/docs` | `src/app/asset/[saleId]/docs/page.tsx` | Ownership documents list with download links (Firebase Storage metadata). |
| `/asset/[saleId]/update` | `src/app/asset/[saleId]/update/page.tsx` | Business-only edit of an existing asset (guarded by `minterId === wallet.address`, `:65`), re-uploads media, calls `updateListing` on-chain then syncs Firestore. |
| `/asset/[saleId]/buy/[noOfFractionsToBuy]` | `src/app/asset/[saleId]/buy/[noOfFractionsToBuy]/page.tsx` | Funding/checkout page used when wallet balance is insufficient: thirdweb `PayEmbed` transaction mode wrapping the approve, then `buyNFT` (`:399-443`). Cross-token routes via thirdweb Bridge are wired but the currency selector is commented out (`:309-338`). |
| `/portfolio` | `src/app/portfolio/page.tsx` | Investor dashboard: two tabs, Performance metrics (stats, holdings with Send/Update/Unlist actions) and Trading History (transaction table). |
| `/portfolio/[purchaseId]` | `src/app/portfolio/[purchaseId]/page.tsx` | Sell flow: pick quantity and price, ERC20 approve then `sellNFT`, then Firestore Listing creation (`:113-157`). |
| `/portfolio/[purchaseId]/[listingId]` | `src/app/portfolio/[purchaseId]/[listingId]/page.tsx` | Update listing price: `unlistNFT` then `sellNFT` at the new price, then Firestore updates (`:96-150`). |
| `/profile` | `src/app/profile/page.tsx` | Own account details (edit name/email/phone), KYC or KYB status badge, logout. Branches retail vs business by hostname (`:34`, `:40-63`). |
| `/profile/[userId]` | `src/app/profile/[userId]/page.tsx` | Public issuer (BusinessUser) profile: contact info, stats, tokenized asset cards, history table. |
| `/settings` | `src/app/settings/page.tsx` | Language, currency (USD/AED/EUR), notification preferences (different sets for retail vs business, `:148-183`), dark mode. Auto-saves on change (`:76-89`). |
| `/verify` | `src/app/verify/page.tsx` | Retail Sumsub KYC (`level=id-only`, `:25`), honors `localStorage.redirectUrl` after approval (`:68-76`). |

### Business routes (served only via subdomain rewrite)

| Route | File | Purpose |
|---|---|---|
| `/business/dashboard` | `src/app/business/dashboard/page.tsx` | Business dashboard: All/Listed/Sold chips, listing cards, summary metrics (total assets, total raised), detailed table with explorer links. Redirects unverified users to `/verify-business` (`:75-78`). |
| `/business/list-new-asset` | `src/app/business/list-new-asset/page.tsx` | Create listing form (`CreateOrUpdateListing`) plus mint confirmation modal (`ListModal`). Redirects unverified users to `/verify-business` (`:89-91`). |
| `/business/verify-business` | `src/app/business/verify-business/page.tsx` | KYB via Sumsub (`level=id-and-liveness`, `:25`). |

### API routes

| Route | File | Purpose |
|---|---|---|
| `GET /api/create-verification-session` | `src/app/api/create-verification-session/route.ts` | Creates a Sumsub SDK access token for the JWT-cookie wallet address, levels `id-only` or `id-and-liveness` (`:69-98`). |
| `POST /api/sumsub-webhook` | `src/app/api/sumsub-webhook/route.ts` | On GREEN review: sets `BusinessUser.isVerified = true` or adds a `RetailUser/{addr}/KYCIdentity` doc (`:11-24`). No signature verification of the webhook payload. |

## 3. Role split: retail vs business subdomain middleware

`src/middleware.ts` is the entire role split. If the `Host` header contains the string `business`, requests to any of `['/marketplace', '/portfolio', '/verify', '/verify-business', '/list-new-asset', '/dashboard']` are rewritten to `/business{path}` (`src/middleware.ts:3-18`). Everything else passes through, so `/asset/*`, `/profile`, `/settings`, `/portfolio/*` are shared screens on both hosts, and client components branch on `window.location.hostname.includes("business")` for copy and table selection (`src/components/navbar.tsx:46-74`, `src/app/profile/page.tsx:34`, `src/app/settings/page.tsx:44`).

Problems with this split:

1. Dead rewrites. `/marketplace`, `/portfolio` and `/verify` are in PATHS but `src/app/business/` contains only `dashboard`, `list-new-asset` and `verify-business`, so on the business host those three paths rewrite to routes that do not exist and 404. Conversely `/dashboard`, `/list-new-asset` and `/verify-business` 404 on the retail host. Navigation UI hides these links per domain, but direct URLs break.
2. Substring matching. `hostname.includes('business')` and the client-side `domain.includes("business")` checks would misclassify any host containing "business" anywhere.
3. Retail-vs-business login mismatch in the navbar. The shared navbar `ConnectButton` calls `login(params)` with the default `'retail'` userType (`src/components/navbar.tsx:89`, `:169`), while the per-page auto-connect on business screens correctly passes `'business'` (`src/app/business/dashboard/page.tsx:97`, `src/app/business/list-new-asset/page.tsx:104`, `src/app/business/verify-business/page.tsx:44`). A business user who first signs in through the navbar button gets a `RetailUser` doc created instead of a `BusinessUser` doc (`src/actions/login.ts:34-45`), after which the dashboard sees no BusinessUser doc and bounces them to `/` (`src/app/business/dashboard/page.tsx:91-93`).
4. There is no server-side authorization: role gating is entirely client effects (`doc.exists` checks plus `router.push`), and Firestore is written directly from the browser.

## 4. State management (zustand)

All four stores are plain `create()` stores, no persistence, no loading or error flags, module-level singletons shared across the app.

| Store | File | State | Fetch source |
|---|---|---|---|
| `assetStore` | `src/store/assetStore.ts` | `assets: Asset[]` | Firestore `Asset` collection, sorted by `createdAt` desc; `fetchAssets` also triggers `nftStore.fetchNfts()` when NFTs are empty (`:15-44`). |
| `nftStore` | `src/store/nftStore.ts` | `nfts: NFT[]` | On-chain `getNFTS()` read via thirdweb, metadata JSON-parsed client side (`src/utils/fetchNFTs.ts:6-18`). |
| `categoryStore` | `src/store/categoryStore.ts` | `categories: Category[]` (name, image, `fields: FieldType[]`) | Firestore `AssetCategory` docs where `isEnabled`, plus each doc's `fields` subcollection (`:24-47`). This is the runtime source of the per-class form and filter schemas. |
| `currencyStore` | `src/store/currencyStore.ts` | `currencies: {USD, EUR, AED}` | Server action `currencyRate()` hitting exchangerate-api with a hardcoded API key in source (`src/actions/currency-rate.ts:15`). |

Unit tests exist for `currencyStore`, `assetStore` (`src/store/__tests__/`), `calculatePurchasePrice`, `purchaseSuccess`, `formatNumberForDisplay` (`src/utils/__tests__/`), and two components (`src/components/__tests__/`).

## 5. The 16 asset classes and per-class form schemas (src/constants.ts)

`src/constants.ts:44-470` defines `assetsTypesFields` with exactly 16 classes: Crypto Mining Farm, Falcons, Watches, IP And Brands, Camels, NFTs, Horses, Luxury Yachts, Diamonds, Private Jets, Real Estate Properties, Luxury Cars, Carbon Credits, Recycle Oasis, Crowdfunding, Financial Derivatives. Field kinds: string (with `filterOptions`), textArea, dropdown (`options`, optional `filter`), document, number (`min`/`max`, `filterOptions`), date (`min`/`max`).

Key finding: the `assetsTypesFields` object itself is dead code in this repo. The only import from `@/constants` anywhere is the `FieldType` type in `src/store/categoryStore.ts:1`. At runtime every consumer reads the same schema shape from Firestore (`AssetCategory/{id}` + `fields` subcollection) via `categoryStore`:

- Marketplace category grid: `src/app/marketplace/page.tsx:15-45` (category names and images).
- Per-class filter menu: `src/app/marketplace/[assetClass]/page.tsx:227-287` renders checkboxes from `filterOptions` and chips from dropdown `filter` fields; the filter matcher camel-cases the field name into a metadata key (`:73-81`).
- Create/update form: `src/components/create-update-listing.tsx:124-212` renders string/textArea/number/dropdown/date inputs and `:367-480` renders per-document-field dropzones; defaults built in `src/app/business/list-new-asset/page.tsx:29-49` and again at `:55-83`, and in `src/app/asset/[saleId]/update/page.tsx:35-55`.
- Validation against min/max on submit: `src/app/business/list-new-asset/page.tsx:126-152` and `src/app/asset/[saleId]/update/page.tsx:174-200`.
- Listing card special-cases `propertyArea`, `location`, `city` metadata keys (`src/components/listing-card.tsx:41-46`, `:93`).

So constants.ts documents the intended 16-class catalog (presumably the seed for the `AssetCategory` collection), but nothing in the frontend falls back to it, and if Firestore's copy drifts from constants.ts the UI follows Firestore. No seeding script exists in this repo.

## 6. Journey coverage

### Business journeys

| Journey | Status | Evidence |
|---|---|---|
| Register | WORKS (with defect) | No dedicated screen; first wallet connect creates the `BusinessUser` doc with `isVerified:false` via `login(params,'business')` (`src/actions/login.ts:31-45`) triggered by `connectWalletConfig('business')` on business pages (`src/app/business/dashboard/page.tsx:97`). Defect: the navbar ConnectButton always registers as retail (`src/components/navbar.tsx:89`), see section 3.3. |
| Profile | WORKS | Shared `/profile` shows business fields (displayName, legalName, email, phone) and KYB badge when hostname contains business (`src/app/profile/page.tsx:40-63`, `:209-219`); edits update `BusinessUser` (`:117-119`). No logo upload UI even though `BusinessUser.logo` is displayed on cards (`src/components/listing-card.tsx:87`). |
| KYC (KYB) | WORKS | `/verify-business` mounts Sumsub with `id-and-liveness` (`src/app/business/verify-business/page.tsx:25`); webhook flips `isVerified` (`src/app/api/sumsub-webhook/route.ts:14-18`); dashboard and list pages gate on it and stash `redirectUrl` (`src/app/business/dashboard/page.tsx:75-78`). |
| Create listing | WORKS | `/business/list-new-asset` composes `CreateOrUpdateListing` (dynamic per-class fields, images, documents, valuation, fractions, KYC-required checkbox) with client validation (`src/app/business/list-new-asset/page.tsx:111-163`) then opens the preview modal. |
| Mint | WORKS (with caveat) | `ListModal.listNFT` uploads media to Firebase Storage, calls `createListing` on-chain (`src/components/assets/list-modal.tsx:148-199`), then approve tx and Firestore writes to `Asset`, `Asset/{id}/Listing`, `KYCRequirement`, `Mint` (`:69-128`). Caveat: it identifies the new NFT as `props.nfts[props.nfts.length - 1]` (`:55`, `:73`), which can bind the wrong NFT if another mint lands concurrently. |
| Dashboard | WORKS (with defects) | `/business/dashboard` shows cards, metrics and the per-asset table (`src/app/business/dashboard/page.tsx:121-221`). Defects: the table renders all rows, `displayedLength` is never applied so View More is inert (`:194`, `:216-219`); zero-asset state renders headers with no empty message. |
| Update price | WORKS | Minter-only button on asset detail (`src/app/asset/[saleId]/page.tsx:685`) opens `/asset/[saleId]/update`, which recomputes price from valuation/fractions, calls `updateListing` (`src/app/asset/[saleId]/update/page.tsx:286-291`) and syncs `Asset` and the minter's `Listing` docs (`:124-156`). |
| Delist | MISSING | No screen, button or contract call lets a business cancel or withdraw its primary listing or asset. The only unlist UI is the retail one on `/portfolio` (`src/app/portfolio/page.tsx:279-289`), which reads `RetailUser/{addr}/Holding` and therefore never surfaces for a business minter. `ListingState.CANCELED` exists in types (`src/types/Listing.ts:3`) but is never set anywhere. |

### Investor journeys

| Journey | Status | Evidence |
|---|---|---|
| Register | WORKS | Implicit: navbar ConnectButton (`src/components/navbar.tsx:78-111`) or the auto-opened connect modal (`connectWalletConfig()`, `src/utils/thirdwebConfig.ts:8-33`); first login creates the `RetailUser` doc (`src/actions/login.ts:36-45`). No onboarding form; profile fields start empty. |
| Browse | WORKS | `/marketplace` category grid (`src/app/marketplace/page.tsx:38-46`), landing page hero also shows 4 live cards (`src/components/landing-page/hero-section.tsx:64-68`). |
| Filter | WORKS | `/marketplace/[assetClass]`: name search (`:130-148`), lowest/highest price sort (`:104-108`), schema-driven attribute filters incl. range buckets like "1000-5000" and "5000+" (`:73-81`, `:227-287`). |
| Asset detail | WORKS (with defect) | `/asset/[saleId]` full detail incl. secondary listings table (`:436-458`) and KYC eligibility (`:459-479`). Defect: `assets.filter(...)` truthiness check at `:138-139` is always true, so an unknown saleId reaches `asset[0]._id` and throws instead of redirecting; user sees a permanent spinner. |
| Buy | WORKS | Sufficient balance: approve then `buyNFT` in place (`src/app/asset/[saleId]/page.tsx:236-274`, `:203-212`); insufficient balance: routed to `/asset/[saleId]/buy/[n]` PayEmbed flow (`:272`, `src/app/asset/[saleId]/buy/[noOfFractionsToBuy]/page.tsx:399-443`). Post-purchase Firestore sync in `src/utils/purchaseSuccess.ts` plus server action `purchaseSuccessOnBlockchain` (`src/actions/purchase-success.ts`). KYC-gated when the asset requires it (`src/app/asset/[saleId]/page.tsx:241-245`). |
| Portfolio | WORKS | `/portfolio` performance tab: totals, ROI, USDC balance, per-holding stats built from `Holding` docs, on-chain NFTs and `Transaction` docs (`src/app/portfolio/page.tsx:168-252`, `:321-448`). |
| Sell | WORKS | List button on holding card routes to `/portfolio/[holdingId]` (`src/components/listing-card.tsx:139`); approve + `sellNFT` + Firestore Listing creation and `lockedQuantity` increment (`src/app/portfolio/[purchaseId]/page.tsx:171-198`, `:113-157`). Blocks double-listing (`:184-187`). |
| Update (listing price) | WORKS | Portfolio Update button (`src/app/portfolio/page.tsx:427-431`) routes to `/portfolio/[purchaseId]/[listingId]`; `unlistNFT` then `sellNFT` at the new price, then Firestore price updates (`src/app/portfolio/[purchaseId]/[listingId]/page.tsx:124-150`, `:96-122`). |
| Unlist | WORKS | Portfolio Unlist button calls `unlistNFT` on-chain then deletes the Listing doc, decrements `availableSupply` and `lockedQuantity`, and repoints `pricePerFraction` (`src/app/portfolio/page.tsx:279-289`, `:254-272`). |
| Transfer | WORKS (with defect) | Send Fractions opens `TransferModal`; ERC20 `transfer`, then holding decrement/increment for both parties and a fee-0 `Transaction` record (`src/components/assets/transfer-modal.tsx:113-132`, `:49-102`). Recipient must already exist as a RetailUser (`:119`). Defect: the Transaction record inverts sender and recipient, `fromWallet: walletAddress` (the recipient) and `toWallet: wallet.address` (the sender) (`:86-87`); history still labels it "transfer" because `fee === 0` (`src/app/portfolio/page.tsx:233`). |
| History | WORKS | Trading History tab merges `Transaction` docs where the wallet is either side, dedupes, sorts desc, and renders type/date/asset/category/amount/price/explorer-link (`src/app/portfolio/page.tsx:171-179`, `:450-499`). Note the purchase convention: the buyer is stored as `fromWallet` (`src/utils/purchaseSuccess.ts:64-65`) and the labeling at `:233` matches that convention. |
| Settings | WORKS | `/settings` language, currency, per-role notification prefs and dark mode, auto-saved to the user doc (`src/app/settings/page.tsx:76-89`). |
| Currency | WORKS | Rates via `currencyStore`/`currencyRate` server action (`src/actions/currency-rate.ts`); user currency from `settings.currency` converts fiat totals on asset detail (`src/app/asset/[saleId]/page.tsx:660-661`), buy page (`.../buy/.../page.tsx:290-291`), transfer modal (`transfer-modal.tsx:245-246`) and list modal (`list-modal.tsx:316-317`). Only USD, EUR, AED are offered (`src/app/settings/page.tsx:123`). |

## 7. Loading, empty and error state coverage per screen

| Screen | Loading | Empty | Error |
|---|---|---|---|
| `/` landing | None (server rendered) | Hero card row simply absent if no assets | None; server fetch failures would crash render |
| `/marketplace` | NONE, blank grid until categories arrive (`src/app/marketplace/page.tsx:17-19`) | NONE, no message when 0 categories | NONE visible; categoryStore logs and rethrows (`src/store/categoryStore.ts:43-45`) with no catch at the page |
| `/marketplace/[assetClass]` | CircularProgress (`:291-294`) | "No listings found" (`:302-304`) | NONE, fetch failures leave the spinner |
| `/asset/[saleId]` | CircularProgress (`:280-283`) | n/a (redirects to /marketplace when nft missing, `:174-179`) | Red error text for tx and validation errors, duplicated for mobile/desktop (`:287`, `:408`), scroll-to-top on error (`:220-224`); countdown modal during tx (`:692`); success modal (`:693-706`). Unknown saleId crashes silently (see 6). |
| `/asset/[saleId]/docs` | CircularProgress (`:89-92`) | NONE, empty list renders headings only; code has a `// Fixme:` and only reads the first document group (`:53-54`), and crashes if `documentUrls` is empty (reachable only by direct URL, entry link is hidden otherwise, `src/app/asset/[saleId]/page.tsx:348`) | NONE |
| `/asset/[saleId]/buy/[n]` | CircularProgress (`:258-261`) | n/a | Red error text (`:274`), tx errors captured (`:171-175`), countdown + success modals (`:444-458`); balance check "Insufficient balance" (`:200-203`) |
| `/portfolio` | CircularProgress incl. wallet balance load (`:323-327`) | "Connect Wallet to Check Portfolio" when no wallet (`:331-333`); stats render zeros; holdings section header hidden when none (`:362`); Trading History tab has NO loading or empty state, just an empty table (`:450-499`) | NONE surfaced; `txError` from unlist is captured into state but never rendered (`:110` defines it, nothing displays it) |
| `/portfolio/[purchaseId]` (sell) | CircularProgress (`:205-208`) | n/a (missing holding redirects, `:66-68`) | Red error text (`:234`), inline price validation (`:363-364`), countdown modal (`:438-450`), success modal (`:211-224`) |
| `/portfolio/[purchaseId]/[listingId]` (update price) | CircularProgress (`:156-159`) | n/a (missing listing redirects, `:64-66`; but a missing asset/nft leaves the spinner forever, `:55-69` has no else) | Red error text (`:186`), inline validation (`:214-215`), success modal (`:162-175`); NO countdown modal during the two sequential txs, only button spinner (`:277`) |
| `/profile` | CircularProgress (`:134-137`) | n/a | Red error text for validation and update failures (`:143`, `:107-114`, `:124`); initial fetch failure only logs (`:92-94`) leaving the spinner |
| `/profile/[userId]` | CircularProgress for listings section (`:174-178`) | NONE for zero listings, stats show 0 | NONE; missing user redirects to `/` (`:90-92`) |
| `/settings` | NONE visually; `loadingState` only gates the autosave effect (`:36`, `:77`) | n/a | NONE; read/write failures only `console.error` (`:68-70`, `:85-87`), toggles can silently fail to persist |
| `/verify`, `/business/verify-business` | CircularProgress until Sumsub token (`verify/page.tsx:81-83`) | n/a | NONE; token fetch failure only logs (`:28-30`), leaving an infinite spinner |
| `/business/dashboard` | CircularProgress (`:129-134`) | NONE, no zero-asset message | NONE; no error surface |
| `/business/list-new-asset` | CircularProgress until verified + categories (`:171-176`) | n/a | Red error banner in form (`create-update-listing.tsx:53`), scroll-to-top on error (`list-new-asset/page.tsx:107-109`); modal has its own error line and tx error capture (`list-modal.tsx:130-146`, `:228`) |
| `/asset/[saleId]/update` | CircularProgress (`:313-316`) | n/a (not-owner and not-found redirect, `:88-98`) | Error banner via shared form, tx errors captured (`:118-122`), success modal (`:298-310`) |

Cross-cutting gaps: no `loading.tsx`, `error.tsx` or `not-found.tsx` files exist anywhere under `src/app`, so route-level errors fall through to the default Next.js overlays; zustand fetches have no retry or error propagation; several screens can strand the user on an infinite spinner when a fetch throws.

## 8. Other notable frontend findings

1. Dead `/login` target: logout confirms then `router.push("/login")` (`src/app/profile/page.tsx:296`) but no `/login` route exists, so logging out lands on a 404. The theme still carries a `login.background` palette entry (`src/theme.ts`).
2. Retail profile field mismatch: the profile form writes `fullName` (`src/app/profile/page.tsx:67`), the `RetailUser` type declares `name` (`src/types/Users.ts:4`), and the asset detail listings table displays `userData.name ?? userData._id` (`src/app/asset/[saleId]/page.tsx:157`), so seller rows will show raw wallet addresses even for completed profiles.
3. Hardcoded third-party API key in source: exchangerate-api key inline at `src/actions/currency-rate.ts:15` (server action, but committed to the repo).
4. Sumsub webhook route does not verify the `x-payload-digest` signature (`src/app/api/sumsub-webhook/route.ts`), so anyone who can reach the endpoint can mark users verified.
5. `next.config.ts:5-11` allows images from every https host (`hostname: '**'`).
6. Marketplace pagination: `displayedLength` works on `/marketplace/[assetClass]` (`:298`, `:308-310`) but is dead on `/business/dashboard` and `/profile/[userId]` tables (rows never sliced, `dashboard/page.tsx:194`, `profile/[userId]/page.tsx:228`).
7. The buy flow's `calculatePurchasePrice` consumes Firestore `Listing` docs sorted by price (`src/utils/calculatePurchasePrice.ts:22-46`) and the on-chain `buyNFT` is expected to match that ordering; the frontend then mutates supply and holdings client side (`src/utils/purchaseSuccess.ts`), an inherently trust-the-client design worth revisiting during the Supabase migration.
8. `k6-result.txt` and `MIGRATION_NOTES.md` confirm this repo is the migration target; nothing in `src` references Supabase yet.
