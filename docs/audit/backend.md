# Backend (Server-Side) Audit

Scope: all server actions, API routes, the thirdweb JWT auth flow, `middleware.ts`, and the Sumsub integration in `/Users/gdbmood/Desktop/Fractionnaire/rwa_marketplace`. All line numbers refer to files in that repo.

## 1. Inventory of server-side code

The entire server surface is small. There are exactly three server action files and two API routes, plus middleware:

| Surface | File | Exports |
|---|---|---|
| Server actions (auth) | `src/actions/login.ts` | `generatePayload`, `login`, `isLoggedIn`, `logout` |
| Server action (settlement) | `src/actions/purchase-success.ts` | `purchaseSuccessOnBlockchain` |
| Server action (FX) | `src/actions/currency-rate.ts` | `currencyRate` |
| API route | `src/app/api/create-verification-session/route.ts` | `GET` |
| API route | `src/app/api/sumsub-webhook/route.ts` | `POST` |
| Middleware | `src/middleware.ts` | `middleware` |
| Server lib | `src/lib/firebaseServer.ts` | Firebase Admin initialization |
| Shared lib | `src/lib/thirdWebClient.ts` | thirdweb client (client and server dual use) |

Every page under `src/app` is a `"use client"` component except `src/app/layout.tsx` and `src/app/page.tsx`, which do no data fetching. There is no server-side rendering of Firestore data; all reads on pages happen in the browser through the Firebase client SDK (`src/lib/firebaseClient.ts`). The server actions above are the only privileged (Firebase Admin) write paths, alongside the Sumsub webhook.

## 2. Auth flow (thirdweb SIWE plus JWT cookie)

### 2.1 How it works

`src/actions/login.ts`:

- Module scope (lines 11 to 22): initializes Firebase Admin, reads `AUTH_PRIVATE_KEY` (throws at import time if missing, line 14 to 16), and builds a `thirdwebAuth` instance with `createAuth({ domain: NEXT_PUBLIC_THIRDWEB_AUTH_DOMAIN || "", adminAccount: privateKeyToAccount(...), client })`. The `AUTH_PRIVATE_KEY` is an EVM private key; the derived account signs both the SIWE login payloads and the session JWTs.
- `generatePayload(address)` (lines 24 to 29): returns a thirdweb SIWE payload for the given address and `NEXT_PUBLIC_THIRDWEB_CHAIN_ID`.
- `login(payload, userType)` (lines 31 to 56): verifies the signed payload with `thirdwebAuth.verifyPayload`. On success it:
  1. Picks a Firestore collection from the client-supplied `userType` (`RetailUser` or `BusinessUser`, line 34).
  2. Creates the user doc keyed by wallet address if absent, `{ createdAt }` for retail, plus `isVerified: false` for business (lines 39 to 45). This is a server write.
  3. Generates a JWT with `thirdwebAuth.generateJWT` embedding `context: { walletAddress }` (lines 48 to 53) and sets it as cookie `jwt` (line 54).
- `isLoggedIn()` (lines 58 to 67): reads the `jwt` cookie and returns `thirdwebAuth.verifyJWT(...).valid`.
- `logout()` (lines 69 to 72): deletes the `jwt` cookie.

The client wires these four actions into thirdweb's ConnectModal in `src/utils/thirdwebConfig.ts:19-33` (in-app wallet with email, passkey, Google, Apple, Facebook, plus account abstraction with sponsored gas).

`jose` itself is not used in the auth flow; JWT creation and verification go through thirdweb's auth helpers. `jose` appears only in the Sumsub session route (see 4.1), and only for unverified decoding.

### 2.2 Request/response shapes

- `generatePayload(address: string)` returns the thirdweb `LoginPayload` (domain, address, nonce, chain id, issued/expiration timestamps).
- `login(payload: VerifyLoginPayloadParams, userType: 'retail' | 'business')` returns `void`. Side effects: Firestore user doc creation, `Set-Cookie: jwt=...`.
- `isLoggedIn()` returns `boolean`.
- `logout()` returns `void`, clears the cookie.

### 2.3 Findings

- **F-AUTH-1 (High): JWT cookie set with no flags.** `cookieStore.set("jwt", jwt)` at `src/actions/login.ts:54` passes no options. The cookie is therefore NOT `HttpOnly`, NOT `Secure`, has no explicit `SameSite` or `Max-Age`. Any XSS anywhere in the app can read the session token via `document.cookie`, and on plain HTTP it is sent in cleartext. It should be `httpOnly: true, secure: true, sameSite: 'strict'` with an expiry matching the JWT.
- **F-AUTH-2 (Medium): `isLoggedIn` ignores the wallet address.** thirdweb's config calls `isLoggedIn(address)` (`src/utils/thirdwebConfig.ts:24`) but the server action (`src/actions/login.ts:58`) checks only that a valid JWT exists. A stale cookie for wallet A answers "logged in" while wallet B is connected. The JWT `sub`/`ctx.walletAddress` should be compared to the requesting address.
- **F-AUTH-3 (Medium): `userType` is fully client controlled.** Any caller can invoke `login(payload, 'business')` and get a `BusinessUser` doc created (`src/actions/login.ts:34-45`). The JWT does not encode the user type, so business identity rests entirely on Firestore doc existence plus the `isVerified` flag. Combined with F-SUM-1 below, business verification is forgeable end to end.
- **F-AUTH-4 (Low): SIWE domain likely empty.** `NEXT_PUBLIC_THIRDWEB_AUTH_DOMAIN` is not present in `.env.example` and defaults to `""` (`src/actions/login.ts:19`). An empty SIWE domain removes the phishing binding that the domain field exists for. Add the variable to `.env.example` and fail hard when it is empty, as is already done for `AUTH_PRIVATE_KEY`.
- **F-AUTH-5 (Info): module-scope throw.** The `AUTH_PRIVATE_KEY` guard at `src/actions/login.ts:14-16` throws at import time, which surfaces as a build or cold-start crash rather than a handled error. Acceptable, but worth knowing during deploys.

## 3. `purchaseSuccessOnBlockchain` server action

### 3.1 What it does

`src/actions/purchase-success.ts:9-66`. Signature: `purchaseSuccessOnBlockchain(assetId: string, quantity: number)`, returns `void`. Using Firebase Admin (rules bypassed) it:

1. Reads `Asset/{assetId}` and its `Listing` subcollection, sorts listings by `pricePerFraction` ascending (lines 12 to 23).
2. Walks listings cheapest first, deleting a listing when fully consumed (line 34) or decrementing its `quantity` (line 36).
3. For each consumed listing, finds the seller's holding via `RetailUser/{listerId}/Holding where assetId == parseInt(assetId)` and decrements `quantity` and `lockedQuantity` (lines 39 to 47).
4. Re-reads listings, then updates the asset: `availableSupply -= quantity` and `pricePerFraction` = new cheapest listing or 0 (lines 52 to 64).

It is called (fire and forget, un-awaited) from the client-side purchase flow at `src/utils/purchaseSuccess.ts:50`, after the browser has already written the buyer's `Holding` and `Transaction` docs directly to Firestore with the client SDK (`src/utils/purchaseSuccess.ts:31-67`).

### 3.2 Findings

- **F-PUR-1 (Critical): completely unauthenticated, unvalidated mutation of marketplace state.** The action never reads the `jwt` cookie, never checks a transaction hash, and never consults the chain. Anyone who can send the server-action POST (or simply call it from the browser console on the site) can invoke `purchaseSuccessOnBlockchain('<anyAssetId>', <anyQuantity>)` and, with admin privileges: delete arbitrary listings, drive sellers' `Holding.quantity`/`lockedQuantity` negative, and push `Asset.availableSupply` to any negative value while zeroing `pricePerFraction`. Despite the name, nothing about the blockchain is verified. At minimum it must verify the JWT, verify the referenced on-chain purchase transaction (hash, buyer, asset, quantity, USDC amounts) via the thirdweb RPC, and be idempotent per tx hash.
- **F-PUR-2 (High): no atomicity, race conditions.** The read-modify-write sequence uses individual `get`/`update`/`delete` calls, not a Firestore transaction or batch. Two concurrent purchases of the same asset double-consume the same listings and produce inconsistent `availableSupply`. The seller `Holding` decrement (lines 43 to 46) is also non-transactional.
- **F-PUR-3 (Medium): `availableSupply` decremented unconditionally.** Line 62 subtracts the full `quantity` even when the listings could not cover it (`remainingFractionsToBuy > 0` after the loop is silently ignored).
- **F-PUR-4 (Medium): trust inversion with the client.** The authoritative buyer-side writes (new `Holding` doc, `Transaction` records with price, fee, tx hash) are performed by the browser via the Firebase client SDK (`src/utils/purchaseSuccess.ts:31-67`), so Firestore security rules must allow clients to write their own holdings and arbitrary `Transaction` docs. The server action only handles the seller/asset side. All economic values (`totalPrice`, `platformFee`, `transactionHash`) are client asserted and never recomputed server side.
- **F-PUR-5 (Low): `parseInt(assetId)` type mismatch.** Line 39 compares `Holding.assetId` (stored as number `nft.nftId`) against `parseInt` of the Asset doc id. If asset doc ids are ever non-numeric the query silently matches nothing and seller holdings are never decremented.

## 4. Sumsub integration

### 4.1 `GET /api/create-verification-session`

`src/app/api/create-verification-session/route.ts`.

Request: `GET /api/create-verification-session?level=<id-only|id-and-liveness>` with the `jwt` cookie. Response: `200` with a JSON string body containing the Sumsub SDK access token, or `400` (`Level not found`, `External user ID not found`), `401` (`Unauthorized`), `500` (`Error creating an applicant`).

Flow: validates `level` against a two-value allowlist (line 74), decodes the `jwt` cookie with `jose.decodeJwt` (line 76), pulls `ctx.walletAddress` as the Sumsub `externalUserId` (line 77), then calls Sumsub `POST /resources/accessTokens/sdk` with `X-App-Token` and an HMAC-SHA256 request signature built from `SUMSUB_SECRET_KEY` (lines 24 to 41). Consumers: `src/app/verify/page.tsx:25` (retail, `id-only`) and `src/app/business/verify-business/page.tsx:25` (business, `id-and-liveness`).

Findings:

- **F-SES-1 (High): the JWT is decoded, not verified.** `jose.decodeJwt` (line 76) performs no signature, expiry, or issuer checks (jose documents it as unsafe for untrusted input). Any visitor can hand-craft an unsigned JWT with `ctx.walletAddress` set to a victim's address, obtain a Sumsub session for that `externalUserId`, and complete KYC "as" that wallet. The route should call the same `thirdwebAuth.verifyJWT` used in `src/actions/login.ts:65`.
- **F-SES-2 (High): shared mutable request config, cross-request race.** A single module-level `config` object (line 17) is mutated by `createAccessToken` (lines 61 to 64) and passed to `axios.request` (line 80). Two concurrent requests interleave: request B overwrites `config.data`/`headers` before request A's `axios.request` snapshot, so user A can receive a token minted for user B's `externalUserId`. Build a fresh config object per request.
- **F-SES-3 (Medium): global axios interceptor.** `axios.interceptors.request.use(createSignature)` (line 20) is registered on the shared default axios instance at module load. Every axios call anywhere in the server process (current or future code) gets Sumsub signature headers appended, and `createSignature` assumes `config.method`/`config.url` exist. Use a dedicated `axios.create()` instance.
- **F-SES-4 (Medium): no authorization on level.** Any logged-in retail user can request `level=id-and-liveness`, the business level. Because the webhook maps any non `id-only` level to `BusinessUser` (see below), a retail wallet can become a verified business.
- **F-SES-5 (Low): secret material can reach logs.** `console.error('Error creating an applicant:', error.response)` (line 83) prints the axios response object, whose `config.headers` includes `X-App-Token` and the computed signature. Log only status and response body.
- **F-SES-6 (Info): undeclared dependency.** `form-data` is imported (line 2) but is only a transitive dependency of axios, it is absent from `package.json`. Declare it or drop the import (the FormData branch of `createSignature` is currently dead code, the only request body is a JSON string).

### 4.2 `POST /api/sumsub-webhook`

`src/app/api/sumsub-webhook/route.ts`.

Request: JSON body, fields used: `reviewResult.reviewAnswer`, `levelName`, `externalUserId`. Response: `{"status":"ok"}` (200) or `{"status":"error","message":"Internal Server Error"}` (500).

Flow: on `reviewAnswer === 'GREEN'`, if `levelName === 'id-only'` it adds a doc `{ sumsubVerified: true }` to `RetailUser/{externalUserId}/KYCIdentity` (line 20 to 22); for any other level it sets `isVerified: true` on `BusinessUser/{externalUserId}` (line 15 to 17). Client pages gate purchases and listing on the presence of a `KYCIdentity` doc with `sumsubVerified == true` (`src/app/asset/[saleId]/page.tsx:114`) and business features on `isVerified`.

Findings:

- **F-SUM-1 (Critical): no webhook authentication at all.** The route does not verify Sumsub's `x-payload-digest` HMAC header (Sumsub signs every webhook with a configurable secret), nor any shared secret or IP allowlist. Anyone on the internet can `curl -X POST https://<site>/api/sumsub-webhook -d '{"reviewResult":{"reviewAnswer":"GREEN"},"levelName":"x","externalUserId":"<victim-or-attacker-wallet>"}'` and mark any wallet as a verified business, or mint a retail KYC pass for any wallet. This bypasses the entire KYC system. Fix: compute HMAC over the raw request body with the webhook secret and compare to `x-payload-digest` (constant-time), and validate the `type` field (for example `applicantReviewed`).
- **F-SUM-2 (Medium): only the GREEN path exists.** RED/RETRY/`applicantReset` outcomes are ignored, so verification is never revoked or corrected. Each repeated GREEN webhook also `add`s a fresh `KYCIdentity` doc (line 20), producing duplicates.
- **F-SUM-3 (Medium): PII to logs.** `console.log('Received webhook data:', data)` (line 9) dumps the full Sumsub payload (applicant ids, review details) into server logs on every delivery.
- **F-SUM-4 (Low): fragile parsing.** `data.reviewResult.reviewAnswer` (line 11) throws a TypeError for any webhook type without `reviewResult` (Sumsub sends several), returning 500 and causing Sumsub retries. `update()` on a nonexistent `BusinessUser` doc also throws (NOT_FOUND). The retail branch writes a `KYCIdentity` subcollection even when no `RetailUser` doc exists, creating orphaned parents.
- **F-SUM-5 (Low): level-to-table mapping is a fallthrough.** `levelName !== 'id-only'` means "business" (line 12), so any future or renamed Sumsub level silently grants business verification.

## 5. `currencyRate` server action

`src/actions/currency-rate.ts:13-27`. Returns `{ USD: 1, EUR: number, AED: number }`. Caches the upstream response in a module-level variable until `time_next_update_unix` passes. Consumed by `src/store/currencyStore.ts`.

- **F-CUR-1 (High): hardcoded third-party API key committed to source.** The exchangerate-api.com key `728eda2f8fc18ac492f2b410` is embedded in the URL at `src/actions/currency-rate.ts:15`. It is server-only at runtime (server action bodies are not shipped to the browser) but it lives in the repository, including the public-history legacy repo lineage. Rotate the key and move it to an env var.
- **F-CUR-2 (Medium): poisoned cache on upstream failure.** If the fetch returns an error payload (quota exceeded, invalid key), `result` is set to that object; `time_next_update_unix` is undefined, so the refresh condition `now > undefined` is always false and the bad payload is cached until process restart, after which line 22 throws `TypeError` reading `conversion_rates.EUR` on every call. Validate the response shape before caching and handle non-200s.
- **F-CUR-3 (Low): open relay for quota burn.** The action is callable by any visitor; each cold cache miss spends the (free-tier) API quota. Low impact given caching, but there is no rate limiting anywhere in the app.

## 6. `middleware.ts` subdomain rewrite

`src/middleware.ts:10-24`. If the `Host` header contains the substring `business` and the path is one of `['/marketplace', '/portfolio', '/verify', '/verify-business', '/list-new-asset', '/dashboard']` (line 3), the request is rewritten to `/business<path>` (lines 5 to 8). Everything else passes through. On exception it redirects to `/`.

- **F-MID-1 (Medium): substring host matching.** `hostname.includes('business')` (line 14) matches any host containing the word (for example `notbusiness.example.com`, or an attacker-chosen `Host` header when the app sits behind a proxy that forwards arbitrary hosts). Match against an explicit allowlist of expected hostnames.
- **F-MID-2 (Medium): the middleware does no auth, and business routes are directly reachable.** The rewrite is cosmetic routing only. `/business/dashboard`, `/business/list-new-asset`, etc. are ordinary routes reachable on any hostname by path; nothing server-side gates them (the pages are client components that do their own checks against client-readable Firestore data). There is no server-enforced route protection anywhere in the app.
- **F-MID-3 (Low): no `config.matcher` export.** The middleware runs on every request including static assets and `_next` internals. Harmless functionally, but wasteful; add a matcher.

## 7. Secrets and configuration handling

Env vars consumed server-side: `AUTH_PRIVATE_KEY` (JWT/SIWE signer key, `src/actions/login.ts:12`), `FIREBASE_PRIVATE_KEY` and `FIREBASE_CLIENT_EMAIL` (service account, `src/lib/firebaseServer.ts:37-38`), `THIRDWEB_SECRET_KEY` (`src/lib/thirdWebClient.ts:4`), `SUMSUB_TOKEN` and `SUMSUB_SECRET_KEY` (`src/app/api/create-verification-session/route.ts:13-14`). Public vars: the `NEXT_PUBLIC_FIREBASE_*` set, `NEXT_PUBLIC_THIRDWEB_CLIENT_ID`, `NEXT_PUBLIC_THIRDWEB_CHAIN_ID`, `NEXT_PUBLIC_THIRDWEB_CONTRACT_ADDRESS`, `NEXT_PUBLIC_USDC_CONTRACT_ADDRESS`, `NEXT_PUBLIC_BLOCKCHAIN_EXPLORER_URL`.

- **F-SEC-1:** the hardcoded exchangerate-api key (F-CUR-1) is the only secret committed to source; all others go through env. No `.env` file is present in the working tree, only `.env.example` with empty values, which is correct.
- **F-SEC-2:** `JWT_SECRET` in `.env.example:17` is dead, nothing reads it (auth signing uses `AUTH_PRIVATE_KEY`). Remove it to avoid operator confusion. Conversely `NEXT_PUBLIC_THIRDWEB_AUTH_DOMAIN` is read (`src/actions/login.ts:19`) but missing from `.env.example` (F-AUTH-4).
- **F-SEC-3:** `src/lib/thirdWebClient.ts` is imported by both client and server code and branches on `THIRDWEB_SECRET_KEY` presence (line 7). Because the variable is not `NEXT_PUBLIC_`, client bundles see `undefined` and fall back to `clientId`, so the secret does not leak, but the dual-use module is fragile; a rename to `NEXT_PUBLIC_*` or a bundler change would ship the secret. Prefer a `server-only` module for the secret-key client.
- **F-SEC-4:** `AUTH_PRIVATE_KEY` is a root-of-trust EVM key. Anyone holding it can mint valid session JWTs for any wallet. There is no rotation story and no JWT audience/expiry tuning in code (thirdweb defaults apply, 24h JWT lifetime).
- **F-SEC-5:** potential secret leakage into logs at `src/app/api/create-verification-session/route.ts:83` (Sumsub `X-App-Token` inside `error.response.config.headers`, see F-SES-5).

## 8. Server data reads and writes (complete map)

Writes (all via Firebase Admin, bypassing security rules):

| Where | Write |
|---|---|
| `src/actions/login.ts:44` | Create `RetailUser/{wallet}` or `BusinessUser/{wallet}` with `{createdAt}` (+`isVerified:false` for business) |
| `src/actions/login.ts:54` | Set `jwt` cookie (no flags) |
| `src/actions/purchase-success.ts:34` | Delete `Asset/{id}/Listing/{listingId}` |
| `src/actions/purchase-success.ts:36` | Update listing `quantity` |
| `src/actions/purchase-success.ts:43` | Update seller `RetailUser/{listerId}/Holding/{docId}` (`quantity`, `lockedQuantity`) |
| `src/actions/purchase-success.ts:61` | Update `Asset/{id}` (`availableSupply`, `pricePerFraction`) |
| `src/app/api/sumsub-webhook/route.ts:15` | Update `BusinessUser/{externalUserId}.isVerified = true` |
| `src/app/api/sumsub-webhook/route.ts:20` | Add `RetailUser/{externalUserId}/KYCIdentity` doc `{sumsubVerified:true}` |

Reads:

| Where | Read |
|---|---|
| `src/actions/login.ts:38` | `RetailUser/{wallet}` or `BusinessUser/{wallet}` existence |
| `src/actions/purchase-success.ts:13,16,39,53` | `Asset/{id}`, its `Listing` subcollection (twice), seller `Holding` query |
| `src/actions/currency-rate.ts:15` | External: `v6.exchangerate-api.com` |
| `src/app/api/create-verification-session/route.ts:70,80` | `jwt` cookie; external: `api.sumsub.com` POST `/resources/accessTokens/sdk` |

Everything else (asset listing, portfolio, profile, business dashboard, asset creation, listing creation, transfers) reads and writes Firestore directly from the browser with the client SDK, meaning the effective security posture of most data depends entirely on Firestore security rules, which are not in this repository and could not be audited.

## 9. What is verified server-side vs trusted from the client

Verified server-side: the SIWE signature at login (`verifyPayload`), the JWT signature in `isLoggedIn`, the `level` allowlist in the Sumsub session route.

Trusted from the client (should not be): `userType` at login; the entire `purchaseSuccessOnBlockchain` call (identity, asset, quantity, and the implicit claim that an on-chain purchase happened); the JWT contents in the Sumsub session route (decoded, unverified); the entire Sumsub webhook body (unauthenticated); all buyer-side purchase records (`Holding`, `Transaction`) written by the browser; all page-level access control (client components only).

## 10. Priority fix list

1. Authenticate the Sumsub webhook with `x-payload-digest` HMAC verification (F-SUM-1).
2. Authenticate and chain-verify `purchaseSuccessOnBlockchain`, make it idempotent per tx hash and transactional (F-PUR-1, F-PUR-2).
3. Replace `jose.decodeJwt` with `thirdwebAuth.verifyJWT` in the verification-session route and stop sharing the axios config object (F-SES-1, F-SES-2).
4. Set `HttpOnly`, `Secure`, `SameSite` on the `jwt` cookie (F-AUTH-1).
5. Rotate and remove the hardcoded exchangerate-api key (F-CUR-1).
6. Tie `isLoggedIn` to the wallet address and gate business level KYC to business users (F-AUTH-2, F-SES-4).
