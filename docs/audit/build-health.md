# Build Health

Audit date: 2026-09-03. Target: /Users/gdbmood/Desktop/Fractionnaire/rwa_marketplace (Next.js 15 App Router). Dependencies were already installed. All commands run from the repo root with Node v25.6.1 and npm 11.9.0.

## Summary

| Check | Command | Result |
| --- | --- | --- |
| Type check | `npx tsc --noEmit` | FAIL on a fresh clone (exit 2, 1 error), PASSES (exit 0) once `next build` has generated `next-env.d.ts` |
| Lint | `npm run lint` | BROKEN (exit 1). ESLint is not installed and no config exists, `next lint` drops into an interactive setup prompt |
| Tests | `npx jest --ci` | PASS (exit 0). 7 suites, 72 tests, ~1.5 s. Coverage is 4.15 percent of statements |
| Build, no env | `npm run build` | FAIL (exit 1) at "Collecting page data" with a thirdweb client error |
| Build, placeholder env | `npm run build` with throwaway `.env.local` | PASS (exit 0). 20 routes, 13 statically prerendered pages |

## Versions (installed, from node_modules)

- next 15.1.7 (pinned exactly in package.json:26)
- react 19.1.1, react-dom 19.1.1 (declared `^19.0.0`, package.json:28-29)
- typescript 5.9.2 (declared `^5`, package.json:48)
- jest 30.0.5, jest-environment-jsdom 30.x (package.json:44-45)
- thirdweb 5.105.37, firebase 11.10.0, firebase-admin 13.4.0, @mui/material 6.5.0, tailwindcss 3.4.17
- eslint: NOT INSTALLED (absent from package.json devDependencies, package.json:36-49, and from node_modules/.bin)

## 1. TypeScript (`npx tsc --noEmit`)

First run on the fresh clone, exit code 2 with exactly one error:

```
src/components/landing-page/footer.tsx(3,18): error TS2307: Cannot find module '../../../public/svg/logo_white.svg' or its corresponding type declarations.
```

The file `public/svg/logo_white.svg` exists. The error is caused by `next-env.d.ts` being absent on a fresh clone (it is gitignored, .gitignore, "typescript" section). That file pulls in Next's global image-type declarations that type `*.svg` static imports (used at src/components/landing-page/footer.tsx:3). After running `npm run build` once (which regenerates `next-env.d.ts`), `npx tsc --noEmit` exits 0 with no errors.

Practical implication: any CI pipeline that runs `tsc --noEmit` before `next build` (or without a checked-in svg module declaration) will fail. Fix options: add a small `declarations.d.ts` with `declare module '*.svg';`, or run the type check after `next build`, or move the logo import to a `next/image` src string.

## 2. Lint (`npm run lint`)

The script is `next lint` (package.json:9). It exits 1 in a non-interactive shell because there is no ESLint setup at all, and `next lint` tries to interactively scaffold one:

```
? How would you like to configure ESLint? https://nextjs.org/docs/app/api-reference/config/eslint
   Strict (recommended)
   Base
   Cancel
```

Verified state of the repo:

- No `.eslintrc*` or `eslint.config.*` file anywhere in the repo root.
- `eslint` and `eslint-config-next` are missing from devDependencies (package.json:36-49) and there is no eslint binary in node_modules/.bin.

So linting is currently non-functional in CI and locally. Note that `next build` still succeeds because Next silently skips the lint step when ESLint is not installed (the build log line "Linting and checking validity of types" only performed type checking). To fix: `npm i -D eslint eslint-config-next` plus a config, and note that `next lint` itself is deprecated in newer Next versions in favor of running ESLint directly.

## 3. Jest (`npx jest --ci`)

Exit 0. Full output:

```
PASS src/utils/__tests__/purchaseSuccess.test.ts
PASS src/utils/__tests__/calculatePurchasePrice.test.ts
PASS src/utils/__tests__/formatNumberForDisplay.test.ts
PASS src/store/__tests__/assetStore.test.ts
PASS src/store/__tests__/currencyStore.test.ts
PASS src/components/__tests__/get-started-button.test.tsx
PASS src/components/__tests__/social-links.test.tsx

Test Suites: 7 passed, 7 total
Tests:       72 passed, 72 total
Snapshots:   0 total
Time:        1.455 s
```

Jest is configured through `next/jest` with jsdom, an `@/` path alias, and coverage collection over all of src (jest.config.js:10-22, setup in jest.setup.js).

### What jest actually covers

The 7 test files and their scope:

- src/utils/__tests__/calculatePurchasePrice.test.ts, pure price math (valid inputs, edge cases, price sorting)
- src/utils/__tests__/formatNumberForDisplay.test.ts, number formatting (K, M, B, T suffixes, edge cases)
- src/utils/__tests__/purchaseSuccess.test.ts, the `purchaseSuccess` util (basic flow, error handling, parameter validation, callbacks, existing holdings), with Firebase mocked
- src/store/__tests__/assetStore.test.ts, zustand asset store (initial state, setAssets, fetchAssets)
- src/store/__tests__/currencyStore.test.ts, zustand currency store (initial state, setCurrencies, fetchCurrencies)
- src/components/__tests__/get-started-button.test.tsx, one small presentational component
- src/components/__tests__/social-links.test.tsx, one small presentational component

Coverage from `npx jest --ci --coverage --watchAll=false` (exit 0):

- All files: 4.15 percent statements, 1.48 percent branches, 4.84 percent functions, 4.28 percent lines.
- Fully or nearly fully covered: calculatePurchasePrice.ts (100), assetStore.ts (100), currencyStore.ts (100), social-links.tsx (100), get-started-button.tsx (100 stmts), purchaseSuccess.ts (95), formatNumberForDisplay.ts (75).
- Zero coverage everywhere else: every page and API route under src/app (including /api/create-verification-session and /api/sumsub-webhook), all server actions in src/actions (currency-rate.ts, login.ts, purchase-success.ts), src/middleware.ts, src/lib (firebaseClient.ts, firebaseServer.ts, thirdWebClient.ts), categoryStore.ts, nftStore.ts, and the remaining utils (ABI.ts, fetchNFTs.ts, thirdwebConfig.ts).

In short, the suite exercises a handful of pure utilities, two zustand stores, and two trivial components. Nothing touching auth, KYC, payments, blockchain, Firestore, or any route handler is tested.

## 4. Production build (`npm run build`)

### 4a. Without any env values (fresh clone state, no .env.local)

Exit 1. Compilation and type checking succeed, the build fails at page data collection:

```
   ▲ Next.js 15.1.7
   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types ...
   Collecting page data ...
[Error: Failed to collect configuration for /] {
  [cause]: Error: clientId or secretKey must be provided
      at <unknown> (.next/server/app/page.js:1:87810)
      ...
}

> Build error occurred
[Error: Failed to collect page data for /] { type: 'Error' }
```

Root cause: src/lib/thirdWebClient.ts:6-8 calls `createThirdwebClient(secretKey ? { secretKey } : { clientId })` at module scope. With no env, both values are undefined and the thirdweb SDK throws "clientId or secretKey must be provided" as soon as the module is imported during page data collection for `/`. So the repo cannot build at all without at least `NEXT_PUBLIC_THIRDWEB_CLIENT_ID` or `THIRDWEB_SECRET_KEY`.

### 4b. With a throwaway .env.local (fake placeholders for every var in .env.example:1-28)

A temporary `.env.local` was created with obviously fake values (for example `NEXT_PUBLIC_THIRDWEB_CLIENT_ID=placeholder`, `NEXT_PUBLIC_THIRDWEB_CHAIN_ID=84532`, `FIREBASE_PRIVATE_KEY=placeholder`, zero addresses for the contract vars). Result, exit 0:

```
 ✓ Compiled successfully
 ✓ Generating static pages (13/13)
```

20 routes built: 8 static (marketplace, portfolio, profile, settings, verify, business/dashboard, business/list-new-asset, business/verify-business, _not-found) and 12 dynamic (/, asset/[saleId] and its buy/docs/update children, marketplace/[assetClass], portfolio/[purchaseId] and child, profile/[userId], plus /api/create-verification-session and /api/sumsub-webhook), and 30.9 kB of middleware. No build warnings.

Difference versus 4a: the only blocker was the thirdweb client instantiation. The placeholder values are never validated at build time, notably `FIREBASE_PRIVATE_KEY=placeholder` was accepted because src/lib/firebaseServer.ts:36-51 only initializes firebase-admin when `initializeFirebaseAdminApp()` is called at request time, not at import time. This means a deployment with wrong or empty Firebase, Sumsub, or JWT secrets will build green and fail at runtime.

The throwaway `.env.local` was deleted after the build. Generated artifacts (`.next/`, `next-env.d.ts`, `tsconfig.tsbuildinfo`, `coverage/`) are all gitignored and were left in place.

### Bundle size observation

First Load JS is very heavy on most authenticated and asset pages, roughly 720 to 792 kB (for example /business/list-new-asset at 792 kB, /settings at 772 kB, /asset/[saleId] at 764 kB), versus a 120 kB shared baseline. This is likely driven by the thirdweb SDK plus MUI plus Firebase all landing in client bundles, and is a performance flag worth a separate look.

## 5. k6-result.txt (repo root)

A checked-in Grafana k6 load test result (k6-result.txt:1-47), script `k6.js` (the script itself is not in this repo). Scenario: up to 500 VUs over 7 stages, 14 minutes. Results: 147,689 iterations, 295,378 checks, 100 percent passed ("status is 200", "body is not empty"), 0 percent failed requests, http_req_duration avg 565.71 ms, med 494.14 ms, p90 1.01 s, p95 1.26 s, max 7.86 s, throughput about 175.6 req/s, 13 GB received. No target URL, environment, or date is recorded in the file, so the result is not reproducible from this repo alone.

## Key takeaways

1. The build is env-gated by a single module-scope thirdweb call (src/lib/thirdWebClient.ts:6-8). Any non-empty thirdweb client id or secret unlocks a green build, no other env value is validated at build time.
2. `tsc --noEmit` fails on a fresh clone solely because `next-env.d.ts` is not generated yet, a CI ordering trap rather than a real type error.
3. Linting does not exist. `npm run lint` cannot run non-interactively and eslint is not even installed.
4. Tests are green but cover about 4 percent of the code, all of it pure utilities, stores, and two tiny components. No API routes, server actions, middleware, or blockchain and Firebase integration code is tested.
5. Client bundles are large (700+ kB first load on most product pages).
6. The k6 result shows a passing load test with acceptable p95 (1.26 s) but no context about what was tested.
