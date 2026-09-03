# Configuration Audit: Environment Variables and Project Config

Target repo: `/Users/gdbmood/Desktop/Fractionnaire/rwa_marketplace` (Next.js 15.1.7, React 19, MUI 6, thirdweb v5, Firebase 11 + firebase-admin 13).

## 1. Environment variable inventory (every `process.env` reference in `src/`)

### 1.1 Client-exposed variables (`NEXT_PUBLIC_`, inlined into the browser bundle at build time)

| Variable | Used in (file:line) | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_THIRDWEB_CLIENT_ID` | `src/lib/thirdWebClient.ts:3` | thirdweb client id, used to create the client on the browser side when no secret key is present |
| `NEXT_PUBLIC_THIRDWEB_CHAIN_ID` | `src/lib/thirdWebClient.ts:12,18`, `src/utils/thirdwebConfig.ts:9`, `src/actions/login.ts:26`, `src/components/navbar.tsx:79,86,158,165`, `src/app/asset/[saleId]/page.tsx:257`, `src/app/asset/[saleId]/buy/[noOfFractionsToBuy]/page.tsx:74,75,95,192,194,207,209`, `src/app/portfolio/page.tsx:120` | EVM chain id, always consumed as `parseInt(...)`, usually wrapped in thirdweb `defineChain(...)` |
| `NEXT_PUBLIC_THIRDWEB_CONTRACT_ADDRESS` | `src/lib/thirdWebClient.ts:13` | address of the marketplace / fractionalization contract, exported as the shared `contract` object |
| `NEXT_PUBLIC_THIRDWEB_AUTH_DOMAIN` | `src/actions/login.ts:19` | SIWE auth domain passed to thirdweb `createAuth` (read inside a server action, but the `NEXT_PUBLIC_` prefix makes it build-time inlined and client-visible) |
| `NEXT_PUBLIC_USDC_CONTRACT_ADDRESS` | `src/app/asset/[saleId]/buy/[noOfFractionsToBuy]/page.tsx:63,64,76,84,98,190,195,210,432,436`, `src/app/asset/[saleId]/page.tsx:260,265`, `src/app/portfolio/page.tsx:123` | USDC token address, default and destination currency for purchases and bridge quotes |
| `NEXT_PUBLIC_BLOCKCHAIN_EXPLORER_URL` | `src/app/business/dashboard/page.tsx:205`, `src/app/portfolio/page.tsx:485`, `src/app/profile/[userId]/page.tsx:238` | base URL for `/tx/<hash>` explorer links |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `src/lib/firebaseClient.ts:8` | Firebase web SDK config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `src/lib/firebaseClient.ts:9` | Firebase web SDK config |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `src/lib/firebaseClient.ts:10`, also server-side in `src/lib/firebaseServer.ts:36` | Firebase project id (shared between client SDK and admin SDK init) |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `src/lib/firebaseClient.ts:11`, also server-side in `src/lib/firebaseServer.ts:39` | storage bucket (shared client and admin) |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `src/lib/firebaseClient.ts:12` | Firebase web SDK config |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `src/lib/firebaseClient.ts:13` | Firebase web SDK config |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | `src/lib/firebaseClient.ts:14` | Firebase Analytics id |

### 1.2 Server-only variables (never shipped to the browser)

| Variable | Used in (file:line) | Purpose |
| --- | --- | --- |
| `AUTH_PRIVATE_KEY` | `src/actions/login.ts:12` | private key for the thirdweb auth admin account (`privateKeyToAccount`), signs SIWE payloads and JWTs; the module throws at import time if it is missing (`login.ts:14-16`) |
| `THIRDWEB_SECRET_KEY` | `src/lib/thirdWebClient.ts:4` | thirdweb secret key; `createThirdwebClient` picks `{ secretKey }` when defined (server) and falls back to `{ clientId }` when undefined (browser). The same module is imported by client components, which works only because server-only vars resolve to `undefined` in the client bundle. Fragile but not a leak |
| `FIREBASE_CLIENT_EMAIL` | `src/lib/firebaseServer.ts:37` | firebase-admin service account email |
| `FIREBASE_PRIVATE_KEY` | `src/lib/firebaseServer.ts:38` | firebase-admin service account key, `\\n` unescaping happens at `firebaseServer.ts:16` |
| `SUMSUB_TOKEN` | `src/app/api/create-verification-session/route.ts:13` | Sumsub app token (assigned to `SUMSUB_APP_TOKEN` constant) for KYC session creation |
| `SUMSUB_SECRET_KEY` | `src/app/api/create-verification-session/route.ts:14` | HMAC-SHA256 signing key for Sumsub API requests (`createSignature`, `route.ts:24-40`) |

### 1.3 Comparison against `.env.example`

`.env.example` (`/Users/gdbmood/Desktop/Fractionnaire/rwa_marketplace/.env.example`, lines 1-28) is byte-identical to the legacy copy at `/Users/gdbmood/Desktop/Fractionnaire/legacy/rwa_marketplace/.env.example` (verified with `diff`).

Flags:

1. **Used in code but MISSING from `.env.example`: `NEXT_PUBLIC_THIRDWEB_AUTH_DOMAIN`** (`src/actions/login.ts:19`). It falls back to `""`, so a fresh setup silently creates a thirdweb auth instance with an empty SIWE domain. This weakens login payload domain-binding and should be added to the example file.
2. **Present in `.env.example` but UNUSED in code: `JWT_SECRET`** (`.env.example:17`). No reference anywhere in `src/`. JWTs are generated and verified by thirdweb auth using `AUTH_PRIVATE_KEY` (`src/actions/login.ts:48,65`), and the only `jose` usage is an unverified `decodeJwt` in `src/app/api/create-verification-session/route.ts:76`. `JWT_SECRET` is dead config and can be removed (or wired in if the KYC route is supposed to verify the JWT, which it currently does not).
3. Everything else matches one to one (15 of 17 example vars are used, 16 of 17 code vars are documented).

### 1.4 Robustness observations

- Almost every env read uses the TypeScript non-null assertion (`!`) with no runtime validation. A missing `NEXT_PUBLIC_THIRDWEB_CHAIN_ID` produces `parseInt(undefined)` which is `NaN` and fails deep inside thirdweb, not at startup. Only `AUTH_PRIVATE_KEY` (`login.ts:14-16`) and the firebase-admin quartet (`firebaseServer.ts:41-43`) fail fast.
- There is no central env module (no zod/env-var schema). Recommendation for the rebuild: a single validated `src/env.ts`.

## 2. Config file audit

### 2.1 `next.config.ts` (lines 1-21)

Only `images.remotePatterns` is configured. The first pattern (`next.config.ts:6-11`) allows `hostname: '**'` over https, which permits the Next image optimizer to proxy any https image URL. That makes the second, specific `firebasestorage.googleapis.com` entry (`next.config.ts:12-15`) redundant. The wildcard is an SSRF and abuse surface for the image optimizer and should be narrowed to the Firebase storage host (plus any CDN actually used). Nothing else: no headers, no redirects, no `serverExternalPackages`, no env plumbing.

### 2.2 `tailwind.config.ts` (lines 1-18)

Tailwind v3 (`tailwindcss ^3.4.1` in `package.json`). Content globs cover `src/pages`, `src/components`, `src/app`. Theme extension is minimal: `colors.background` and `colors.foreground` mapped to CSS variables `--background` / `--foreground`. No plugins. Note the dual styling stack: Tailwind coexists with MUI, and virtually all real theming lives in the MUI theme (section 3), so Tailwind is close to vestigial here.

### 2.3 `tsconfig.json` (lines 1-27)

`strict: true`, target `ES2017`, `moduleResolution: "bundler"`, `jsx: "preserve"`, `allowJs`, `skipLibCheck`, Next plugin, and path alias `"@/*": ["./src/*"]` (`tsconfig.json:21-23`). Standard Next 15 defaults, nothing exotic.

### 2.4 Jest configuration

- `jest.config.js` (lines 1-25): uses `next/jest` with `dir: './'` (so Jest loads `next.config.ts` and `.env*` files), `testEnvironment: 'jsdom'`, setup file `jest.setup.js`, ignores `.next/` and `node_modules/`, module mapper mirrors the `@/` alias (`jest.config.js:13-15`), and coverage collected from `src/**/*.{js,jsx,ts,tsx}` excluding `.d.ts`, `index.ts`, and stories (`jest.config.js:16-21`).
- `jest.setup.js` (lines 1-124): imports `@testing-library/jest-dom`; mocks `next/router` (lines 5-25), `next/navigation` (lines 28-44), `next/image` as a plain `img` (lines 47-54), Firebase compat modules `firebase/compat/app|firestore|storage` (lines 57-71, the comment notes the app uses compat mode), the top-level `thirdweb` module (lines 74-80, only 5 functions mocked), plus `window.matchMedia`, `IntersectionObserver`, and `ResizeObserver` (lines 83-123). Submodule imports such as `thirdweb/auth`, `thirdweb/wallets`, and `thirdweb/react` are NOT mocked, so components importing those need per-test mocks.
- Scripts in `package.json`: `test`, `test:watch`, `test:coverage`, `test:ci`.

## 3. `src/theme.ts` (MUI theme tokens, for later design work)

`"use client"` module exporting `createTheme` result (`src/theme.ts:79-237`) with `cssVariables: { colorSchemeSelector: 'class' }` (`theme.ts:234-236`), meaning light/dark switch via a class on the root element and MUI CSS variables.

- **Typography** (`theme.ts:80-82`): single family `Satoshi-Variable, sans-serif`, no size/weight scale defined.
- **Breakpoints** (`theme.ts:83-93`): standard xs/sm/md/lg/xl plus two custom ones added by module augmentation (`theme.ts:5-9`): `verticalTablet: 768` and `horizontalTablet: 960`.
- **Palette structure** (augmentation at `theme.ts:11-77`): tokens are page and component scoped rather than semantic. Custom slots: `login`, `navbar` (with nested `drawer`), `thirdwebButton`, `border`, `divider`, `marketplace` (with nested `categoryFilter`), `listingCard`, `readSlider`, `assetPurchase` (with nested `readSlider` and `modal`), `portfolio` (table row striping tokens), `settings`, `listNewAsset`.
- **Light scheme** (`theme.ts:95-162`): near-white surfaces (`#FAFAFA`, `#F5F5F5`, `#EEEEEE`), Material grey text ramp (`#212121` to `#9E9E9E`), accent green `#36AB00` (category filter background and purchase slider), alert red `#E43336`.
- **Dark scheme** (`theme.ts:164-231`): near-black surfaces (`#141414`, `#161616`, `#1B1B1B`, `#212121`), light text (`#FAFAFA`, `#FFFFFF`, `#ECEFF1`), accent switches to lime `#C6FF00` with dark text, alert red `#E34848`, translucent overlays (`rgba(255,255,255,0.12)`, `rgb(0,0,0,0.7)`).
- **Design debt for the rebuild**: no `primary`/`secondary` brand palette is set (MUI defaults to its stock blue for standard components), the light and dark accents are different hues (`#36AB00` vs `#C6FF00`), and per-page token buckets will not scale. A semantic token layer (surface/text/accent/border ramps) is the obvious replacement.

## 4. `src/constants.ts` (asset classes and per-class form schema)

### 4.1 Schema shape

A discriminated union `FieldType` (`src/constants.ts:1-38`) with `name` on every field and `type` as discriminant:

- `string` (`constants.ts:5-8`): optional `filterOptions: string[]` (suggested filter buckets, free text input).
- `textArea` (`constants.ts:10-12`): defined but used by zero asset classes (dead variant).
- `dropdown` (`constants.ts:14-18`): required `options: string[]`, optional `filter?: boolean` marking it as a marketplace filter facet.
- `document` (`constants.ts:20-22`): file upload field.
- `number` (`constants.ts:24-29`): optional `min`, `max`, `filterOptions` (range buckets as strings, e.g. `"1000-5000"`).
- `date` (`constants.ts:31-36`): optional `min`/`max` as `Date`, optional `filterOptions`.

The registry is `assetsTypesFields: { [assetType: string]: FieldType[] }` (`constants.ts:40-44`). Note that several `min`/`max` values are computed at module load (`new Date().getFullYear()` at `constants.ts:102,194,256,298,342`, and Financial Derivatives expiry `min: new Date()`, `max: now + 10 years` at `constants.ts:434-435`), so they freeze at build/import time.

### 4.2 The 16 asset classes

| # | Asset class | Fields (count) | Notable fields |
| --- | --- | --- | --- |
| 1 | Crypto Mining Farm | 5 | Location (string), Hash Rate and Power Usage (number ranges), Equipment Details, Ownership Rights (document) |
| 2 | Falcons | 3 | Breed (string, 5 suggested breeds), Age (number 1-10), Training Records (document) |
| 3 | Watches | 5 | Brand, Model (strings), Year (number 1900-now), Condition (dropdown New/Used, filter), Ownership Rights (document) |
| 4 | IP And Brands | 2 | IP Type (dropdown Trademark/Patent/Copyright, filter), Ownership Proof (document) |
| 5 | Camels | 3 | Breed (string), Age (number 1-50), Health Records (document) |
| 6 | NFTs | 4 | Category (dropdown, filter), Artist (string), Minting Details (string), Ownership Rights (document) |
| 7 | Horses | 5 | Horse Name, Breed (strings), Age (number 1-20), Racing History (string), Ownership Rights (document) |
| 8 | Luxury Yachts | 5 | Model (string), Year, Length (numbers), Engine Type (string), Maintenance Records (document) |
| 9 | Diamonds | 6 | Category, Cut Quality, Color Grade (D-J), Clarity (FL-I1) (all filter dropdowns), Carat Weight (number 0.1-100), Ownership Rights (document) |
| 10 | Private Jets | 5 | Model (string), Year, Flight Hours (numbers), Maintenance Records and Ownership Proof (2 documents) |
| 11 | Real Estate Properties | 4 | Property Area (number), City (string), Category (dropdown of 7 property types, filter), Ownership Rights (document) |
| 12 | Luxury Cars | 4 | Year, Mileage (numbers), Condition (dropdown New/Used/Vintage, filter), Ownership Proof (document) |
| 13 | Carbon Credits | 6 | Credit Type (dropdown, filter), Total Credits, Credit Value, Issuance Year (numbers), Issuer (string), Ownership Proof (document) |
| 14 | Recycle Oasis | 5 | Recycling Type and Material Type (filter dropdowns), Weight, Carbon Offset (numbers), Recycling Certification (document) |
| 15 | Crowdfunding | 6 | Project Type (dropdown, filter), Funding Goal, Investors Allowed, ROI Expectation (numbers), Project Timeline (date), Ownership Proof (document) |
| 16 | Financial Derivatives | 8 | Derivative Type and Underlying Asset (filter dropdowns), Expiry Date (date, now to +10y), Strike Price, Leverage Ratio, Current Value, Margin Requirements (numbers), Ownership Rights (document) |

Pattern: every class terminates in exactly one or two `document` fields for proof of ownership or records, and each class exposes 1-4 filterable facets (either `dropdown` with `filter: true` or `filterOptions` buckets on string/number fields).

## 5. USDC decimals handling

USDC is treated as a 6-decimal token, hardcoded everywhere, never read from the contract:

- `toUnits(amountString, 6)` when preparing approvals and transfers: `src/app/asset/[saleId]/page.tsx:262`, `src/app/asset/[saleId]/buy/[noOfFractionsToBuy]/page.tsx:434,437`.
- Raw `* 10 ** 6` when computing the bridge quote amount: `buy/[noOfFractionsToBuy]/page.tsx:187`.
- `Math.round(x * 1e6) / 1e6` float rounding of `pricePerFraction` before writing to Firestore, and `BigInt(Math.round(x * 1e6))` when sending on-chain prices: `src/app/asset/[saleId]/update/page.tsx:131,136,289`, `src/app/portfolio/page.tsx:286`, `src/app/portfolio/[purchaseId]/page.tsx:123,131,164`, `src/app/portfolio/[purchaseId]/[listingId]/page.tsx:107,108,130,147`, `src/components/assets/list-modal.tsx:85,90,197`.
- Reverse conversion when reading NFTs from chain: `Number(nft.pricePerFraction) / 1e6` at `src/utils/fetchNFTs.ts:13`.
- Platform fee is in basis points (`/ 10000`) and then display-rounded to 6 decimals: `asset/[saleId]/page.tsx:674`, `buy/[noOfFractionsToBuy]/page.tsx:304`.

Risks for the rebuild: JS float arithmetic before `Math.round` invites cent-level drift for large valuations, the constant 6 is duplicated in at least 5 files, and swapping `NEXT_PUBLIC_USDC_CONTRACT_ADDRESS` to any token with different decimals silently corrupts every price. Centralize as a `USDC_DECIMALS` constant (or read `decimals()` once) and do integer math in bigint.

## 6. Chain id usage sites

`NEXT_PUBLIC_THIRDWEB_CHAIN_ID` is always consumed as `parseInt(process.env.NEXT_PUBLIC_THIRDWEB_CHAIN_ID!)`, duplicated at 15 call sites instead of one shared constant:

- `src/lib/thirdWebClient.ts:12,18` (shared `contract` and `getContractByAddress` helpers).
- `src/utils/thirdwebConfig.ts:9` (wallet connect config, also reused for account abstraction chain).
- `src/actions/login.ts:26` (SIWE payload `chainId`, the only site that passes the bare number instead of `defineChain`).
- `src/components/navbar.tsx:79,86,158,165` (ConnectButton chain and gas-sponsored account abstraction, duplicated for desktop and mobile renders).
- `src/app/asset/[saleId]/page.tsx:257` and `src/app/portfolio/page.tsx:120` (bridge/balance token lookups).
- `src/app/asset/[saleId]/buy/[noOfFractionsToBuy]/page.tsx:74,75,95,192,194,207,209` (Bridge.tokens and Bridge.Buy.quote calls where `originChainId` and `destinationChainId` are both the same env value, so cross-currency purchases are same-chain swaps into USDC).

Recommendation: one exported `CHAIN` (result of `defineChain`) and one `CHAIN_ID` number from a validated env module, imported everywhere.
