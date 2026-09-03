# Firebase / Firestore Usage Map (Supabase Migration Work List)

Audit date: 2026-09-03. Target repo: `/Users/gdbmood/Desktop/Fractionnaire/rwa_marketplace`.

This document maps every Firebase usage site in the target repo: Firestore reads/writes, Firebase Storage uploads/downloads, and the two SDK entry points. "Browser" means the code runs in a `"use client"` component through the Firebase Web compat SDK (direct client-to-Firestore, gated only by Firestore security rules). "Server" means it runs in a server action, API route, or React Server Component through `firebase-admin`.

There are no `onSnapshot` / real-time listeners anywhere in the repo. All access is one-shot `get`, `set`, `add`, `update`, `delete`.

## 1. SDK entry points

### 1.1 Client SDK: `src/lib/firebaseClient.ts` (browser)

- Lines 3-5: imports `firebase/compat/app`, `firebase/compat/firestore`, `firebase/compat/storage` (the old namespaced compat API, not the modular v9 API).
- Lines 7-15: config from `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`, `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`.
- Line 21: exports `firebaseApp` (used for `firebaseApp.firestore.FieldValue.increment(...)` at several write sites).
- Line 22: exports `storage` (Firebase Storage compat).
- Line 23: exports `db` (Firestore compat).

There is no Firebase Auth usage anywhere; identity is the thirdweb wallet address, used directly as the Firestore document id for `RetailUser` and `BusinessUser`.

### 1.2 Admin SDK: `src/lib/firebaseServer.ts` (server)

- Lines 10-33: `createFirebaseAdminApp` initializes `firebase-admin` with a service-account cert (`FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`) plus `NEXT_PUBLIC_FIREBASE_PROJECT_ID` and `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`.
- Lines 35-51: `initializeFirebaseAdminApp` validates env vars and returns the app. Called from `src/actions/login.ts:11`, `src/actions/purchase-success.ts:10`, `src/app/api/sumsub-webhook/route.ts:7`, `src/components/landing-page/hero-section.tsx:12`.

### 1.3 Peripheral config and mocks

- `next.config.ts:14`: image remote pattern allows `firebasestorage.googleapis.com` (image URLs stored in NFT metadata point there).
- `jest.setup.js:56-71`: mocks `firebase/compat/app`, `firebase/compat/firestore`, `firebase/compat/storage`.
- `src/store/__tests__/assetStore.test.ts:5,9` and `src/utils/__tests__/purchaseSuccess.test.ts:7,10-14`: mock `@/lib/firebaseClient` (`db`, `firebaseApp.firestore.FieldValue.increment`). These tests must be rewritten against the Supabase client.

## 2. Firestore usage sites, by file

### 2.1 `src/actions/login.ts` (server action)

| Line | Collection | Operation | Details |
|---|---|---|---|
| 37-38 | `RetailUser` or `BusinessUser` (chosen by `userType` at line 34) | read | `db.collection(tableName).doc(walletAddress).get()`, existence check only |
| 44 | `RetailUser` or `BusinessUser` | write (set) | Creates user doc keyed by wallet address. Shape: `{ createdAt: Date }`; for business users also `isVerified: false` (boolean, lines 40-43). Note: `createdAt` here is a JS `Date` (stored as Firestore Timestamp), while every client-side write uses ISO strings. |

### 2.2 `src/actions/purchase-success.ts` (server action, called fire-and-forget from browser after on-chain buy)

| Line | Collection | Operation | Details |
|---|---|---|---|
| 12-13 | `Asset` | read | `Asset/{assetId}` doc get; typed as `Asset` (line 52) |
| 15-16, 53 | `Asset/{assetId}/Listing` | read | full subcollection get, twice (before and after mutation); typed `Listing`, sorted by `pricePerFraction` |
| 34 | `Asset/{assetId}/Listing` | delete | deletes a listing doc when its `quantity` is fully consumed |
| 36 | `Asset/{assetId}/Listing` | update | `{ quantity: number }` (decrement computed in JS) |
| 39 | `RetailUser/{listerId}/Holding` | read (query) | `where('assetId', '==', parseInt(assetId))`. NOTE: queries `assetId` as a number; the `Asset` doc id is a string. Mixed number/string typing on `assetId` is pervasive (see section 5). |
| 43-46 | `RetailUser/{listerId}/Holding` | update | `{ quantity: number, lockedQuantity: number }` (seller side decrement) |
| 61-64 | `Asset` | update | `{ availableSupply: number, pricePerFraction: number }` (recomputed lowest listing price, 0 when no listings remain) |

### 2.3 `src/app/api/sumsub-webhook/route.ts` (server, API route, called by Sumsub)

| Line | Collection | Operation | Details |
|---|---|---|---|
| 15-17 | `BusinessUser` | update | when `levelName !== 'id-only'` and review is GREEN: `{ isVerified: true }` on doc id `data.externalUserId` (wallet address) |
| 20-22 | `RetailUser/{externalUserId}/KYCIdentity` | write (add) | `{ sumsubVerified: true }` (boolean); auto id |

### 2.4 `src/components/landing-page/hero-section.tsx` (server, React Server Component on the landing page)

| Line | Collection | Operation | Details |
|---|---|---|---|
| 17-19 | `Asset` | read | full collection get via admin SDK, mapped to `Asset` type with `_id: doc.id` |
| 24-25 | `BusinessUser` | read | per-asset owner lookup by `nft.nftOwner` (wallet address); fields used: `displayName: string`, `logo?: string` |

### 2.5 `src/store/assetStore.ts` (browser, zustand)

| Line | Collection | Operation | Details |
|---|---|---|---|
| 25 | `Asset` | read | full collection get; doc shape read (lines 27-37): `createdAt: string (ISO)`, `txHash: string`, `initialSupply: number`, `availableSupply: number`, `assetCategory: string (AssetCategory doc id)`, `minterId: string (wallet)`, plus spread of remaining fields (`internalId: string (uuid)`, `assetName: string`, `pricePerFraction: number`) |

### 2.6 `src/store/categoryStore.ts` (browser, zustand)

| Line | Collection | Operation | Details |
|---|---|---|---|
| 26 | `AssetCategory` | read | full collection get; doc shape: `{ isEnabled: boolean, name: string, image: string }` |
| 31 | `AssetCategory/{id}/fields` | read | subcollection get; each doc is a `FieldType` (`src/constants.ts:1-38`): `{ name: string, type: "string" | "textArea" | "dropdown" | "document" | "number" | "date", options?: string[], min?, max?, filterOptions?: string[], filter?: boolean }` |

No code in this repo writes `AssetCategory` or its `fields` subcollection; it is seeded outside the app (console or legacy tooling). Migration must include a data export for it.

### 2.7 `src/utils/purchaseSuccess.ts` (browser, called after successful on-chain buy)

| Line | Collection | Operation | Details |
|---|---|---|---|
| 24 | `AssetCategory` | read (query) | `where('name', '==', nft.metadata.assetClass)`, takes first doc id |
| 31 | `RetailUser/{buyer}/Holding` | read (query) | `where('assetId', '==', nft.nftId)` (number) |
| 35-38 | `RetailUser/{buyer}/Holding` | update | `{ quantity: FieldValue.increment(noOfFractionsToBuy), averageEntryPrice: number }` (weighted average recomputed in JS) |
| 41-48 | `RetailUser/{buyer}/Holding` | write (add) | `{ createdAt: string (ISO), quantity: number, lockedQuantity: 0, assetId: number (nft.nftId), assetCategory: string | null (AssetCategory doc id), averageEntryPrice: number }` |
| 53-66 | `Transaction` | write (add) | one per fill source: `{ date: string (ISO), txHash: string, quantity: number, pricePerFraction: number, currency: "USDC", fee: number, feeCurrency: "USDC", listingId: string (actually the Asset doc id), assetId: number, assetCategory: string | null, fromWallet: string (buyer), toWallet: string (seller) }` |

Line 50 also fire-and-forgets the server action `purchaseSuccessOnBlockchain` (section 2.2), so a purchase writes from BOTH browser and server without a transaction. Race-prone; the Supabase version should collapse this into one server-side RPC/transaction.

### 2.8 `src/components/assets/list-modal.tsx` (browser, business mint-and-list flow)

Firestore (all inside a `Promise.all` after the approve tx succeeds):

| Line | Collection | Operation | Details |
|---|---|---|---|
| 76-86 | `Asset` | write (set) | doc id `nft.nftId.toString()`. Shape: `{ internalId: string (uuid v4), createdAt: string (ISO), txHash: string, assetName: string, initialSupply: number, availableSupply: number, assetCategory: string (AssetCategory doc id, fallback 'other'), minterId: string (wallet), pricePerFraction: number (rounded to 1e-6) }` |
| 87-96 | `Asset/{nftId}/Listing` | write (add) | `{ createdAt: string (ISO), quantity: number, pricePerFraction: number, currency: 'USDC', state: ListingState.ACTIVE, assetId: number (nft.nftId), listerId: string (wallet), assetCategory: string }`. Note this initial listing carries `assetCategory`; listings created in the sell flow (2.12) do not. |
| 99-101 | `Asset/{nftId}/KYCRequirement` | write (add) | `{ sumsubVerified: true }` only when `formData.userKycRequired` |
| 104-113 | `Mint` | write (add) | `{ createdAt: string (ISO), txHash: string, assetId: number, mintSupply: number, minterId: string (wallet), mintPrice: number, mintCurrency: "USDC", mintFee: 0 }` |

Firebase Storage (in `listNFT`, before the mint tx):

| Line | Path | Operation | Details |
|---|---|---|---|
| 161-163 | `assets/{uuid}/images/{fileName}` | upload + read URL | `imageRef.put(File)` then `getDownloadURL()`; URLs go into on-chain NFT metadata `imageUrls: string[]` |
| 172-175 | `assets/{uuid}/documents/{fileName}` | upload + read URL | `documentRef.put(File)` then `getDownloadURL()`; URLs go into metadata `documentUrls: { [docFieldName: string]: string[] }` |

### 2.9 `src/components/assets/transfer-modal.tsx` (browser, retail fraction transfer)

| Line | Collection | Operation | Details |
|---|---|---|---|
| 119 | `RetailUser` | read | recipient existence check: `doc(walletAddress).get()` |
| 52-54 | `RetailUser/{sender}/Holding` | update | `{ quantity: FieldValue.increment(-noOfFractionsToSend) }` |
| 55 | `RetailUser/{recipient}/Holding` | read (query) | `where('assetId', '==', holding.assetId)` |
| 58-65 | `RetailUser/{recipient}/Holding` | write (add) | `{ createdAt: string (ISO), assetCategory: string, assetId: number|string (copied from sender holding), averageEntryPrice: 0, quantity: number, lockedQuantity: 0 }` |
| 68-71 | `RetailUser/{recipient}/Holding` | update | `{ quantity: FieldValue.increment(n), averageEntryPrice: number }` (bug note: formula at line 70 dilutes the average without adding transferred value, `(avg*qty)/(qty+n)`) |
| 75-88 | `Transaction` | write (add) | `{ date: string (ISO), txHash: string, quantity: number, pricePerFraction: number, currency: "USDC", fee: 0, feeCurrency: "USDC", listingId: string (Asset doc id), assetId: number, assetCategory: string (category NAME here, not id, line 74), fromWallet: string, toWallet: string }`. Inconsistent with 2.7 where `assetCategory` is the doc id, and `fromWallet`/`toWallet` are swapped relative to the actual direction (fromWallet is the recipient at line 86). |

### 2.10 `src/app/settings/page.tsx` (browser)

| Line | Collection | Operation | Details |
|---|---|---|---|
| 58 | `RetailUser` or `BusinessUser` (hostname decides, line 44) | read | reads `settings.language`, `settings.currency`, `settings.preferences` |
| 78-87 | same | update | `{ settings: { language: string, currency: string, preferences: { investmentUpdates?, newsInsights?, securityAlerts, transactionConfirmations?, transactionAlerts? } (all booleans), darkMode: boolean } }` |

### 2.11 `src/app/profile/page.tsx` (browser)

| Line | Collection | Operation | Details |
|---|---|---|---|
| 35 | `RetailUser` or `BusinessUser` (hostname decides, line 34) | read | business: `displayName`, `legalName`, `email`, `phone`; retail: `fullName`, `email`, `phone`; both: `isVerified` (line 84-85). Note retail read uses `fullName` while `src/types/Users.ts:5` declares `name`; `RetailUser.isVerified` is read here but never written anywhere for retail (retail verification lives in `KYCIdentity`). |
| 118-119 | same | update | spread of the edited fields above (`displayName`/`legalName`/`fullName`, `email`, `phone`, all strings) |

### 2.12 `src/app/portfolio/page.tsx` (browser)

| Line | Collection | Operation | Details |
|---|---|---|---|
| 147 | `RetailUser` | read | profile doc, typed `RetailUser` |
| 172 | `Transaction` | read (query) | `where('fromWallet', '==', wallet.address)` |
| 173 | `Transaction` | read (query) | `where('toWallet', '==', wallet.address)`; results merged and deduped by id (lines 174-179); fields consumed: `date`, `assetId`, `fee`, `fromWallet`, `toWallet`, `quantity`, `pricePerFraction`, `txHash` |
| 182 | `RetailUser/{wallet}/Holding` | read | full subcollection, typed `Holding` |
| 190 | `Asset/{assetId}/Listing` | read (query) | `where('listerId', '==', wallet.address)` |
| 193 | `BusinessUser` | read | NFT owner lookup; uses `displayName`, `logo` |
| 257 | `Asset/{assetId}/Listing` | read | full subcollection (unlist flow) |
| 262 | `Asset/{assetId}/Listing` | delete | deletes the caller's listing doc |
| 263-266 | `Asset` | update | `{ availableSupply: FieldValue.increment(-quantity), pricePerFraction: number (next lowest listing or 0) }` |
| 267-269 | `RetailUser/{wallet}/Holding` | update | `{ lockedQuantity: FieldValue.increment(-quantity) }` |

### 2.13 `src/app/portfolio/[purchaseId]/page.tsx` (browser, sell/list flow)

| Line | Collection | Operation | Details |
|---|---|---|---|
| 49 | `RetailUser` | read | profile doc |
| 58 | `RetailUser/{wallet}/Holding` | read | doc get by `params.purchaseId`, typed `Holding` |
| 117-118 | `Asset` | read | doc get by `listing.nft.nftId.toString()`, typed `Asset` |
| 120-128 | `Asset/{nftId}/Listing` | write (add) | `{ createdAt: string (ISO), quantity: number, pricePerFraction: number (rounded 1e-6), currency: 'USDC', state: ListingState.ACTIVE, assetId: number (nft.nftId), listerId: string }` (no `assetCategory`, unlike 2.8) |
| 129-132 | `Asset` | update | `{ availableSupply: FieldValue.increment(fractionsToSell), pricePerFraction: min(new, existing) }` |
| 134 | `RetailUser/{wallet}/Holding` | read (query) | `where('assetId', '==', listing.nft.nftId)` |
| 137-139 | `RetailUser/{wallet}/Holding` | update | `{ lockedQuantity: FieldValue.increment(fractionsToSell) }` |
| 182 | `RetailUser/{wallet}/Holding` | read (query) | pre-check duplicate listing (`lockedQuantity > 0` guard) |

### 2.14 `src/app/portfolio/[purchaseId]/[listingId]/page.tsx` (browser, edit listing price)

| Line | Collection | Operation | Details |
|---|---|---|---|
| 43 | `RetailUser` | read | profile doc |
| 52 | `RetailUser/{wallet}/Holding` | read | doc get by `params.purchaseId` |
| 59 | `Asset/{assetId}/Listing` | read | doc get by `params.listingId`, typed `Listing` |
| 100 | `Asset` | read | doc get |
| 107 | `Asset/{assetId}/Listing` | update | `{ pricePerFraction: number (rounded 1e-6) }` |
| 108 | `Asset` | update | `{ pricePerFraction: min(new, existing) }` |

### 2.15 `src/app/asset/[saleId]/page.tsx` (browser, asset detail / buy widget)

| Line | Collection | Operation | Details |
|---|---|---|---|
| 103 | `RetailUser` | read | profile doc, typed `RetailUser` |
| 114 | `RetailUser/{wallet}/KYCIdentity` | read (query) | `where('sumsubVerified', '==', true).limit(1)`; presence means KYC verified |
| 127 | `Asset/{saleId}/KYCRequirement` | read (query) | `where('sumsubVerified', '==', true).limit(1)`; presence means asset requires KYC |
| 142 | `Asset/{assetId}/Listing` | read | full subcollection, typed `Listing` |
| 148 | `RetailUser` or `BusinessUser` | read | per-listing owner lookup (`data.listerId`); table picked by whether lister is `nft.nftOwner` (line 146); uses `name` else falls back to doc id (line 157) |
| 185 | `BusinessUser` | read | NFT owner profile, typed `BusinessUser` |

### 2.16 `src/app/asset/[saleId]/buy/[noOfFractionsToBuy]/page.tsx` (browser, checkout)

| Line | Collection | Operation | Details |
|---|---|---|---|
| 103 | `RetailUser` | read | profile doc |
| 122 | `Asset/{assetId}/Listing` | read | full subcollection, typed `Listing` |

Writes for this page happen via `src/utils/purchaseSuccess.ts` (2.7) at line 158 and the server action (2.2).

### 2.17 `src/app/asset/[saleId]/update/page.tsx` (browser, business edit asset)

Firestore:

| Line | Collection | Operation | Details |
|---|---|---|---|
| 62 | `Asset` | read | doc get; ownership check against `minterId` (line 65) |
| 68 | `Asset/{saleId}/KYCRequirement` | read (query) | `where('sumsubVerified', '==', true).limit(1)` |
| 126 | `Asset` | read | re-get before update |
| 129-132 | `Asset` | update | `{ assetName: string, pricePerFraction: min(existing, new) }` |
| 133-139 | `Asset/{saleId}/Listing` | read (query) + update | `where('listerId', '==', wallet.address)`, then `querySnapshot.docs[0].ref.update({ pricePerFraction: number })` (line 135) |
| 141 | `Asset/{saleId}/KYCRequirement` | read (query) | all `sumsubVerified == true` docs |
| 143-145 | `Asset/{saleId}/KYCRequirement` | write (add) | `{ sumsubVerified: true }` when enabling |
| 148 | `Asset/{saleId}/KYCRequirement` | delete | `doc.ref.delete()` for every matched doc when disabling |

Firebase Storage:

| Line | Path | Operation | Details |
|---|---|---|---|
| 232-238 | `assets/{uuid}/images/{fileName}` (path reverse-engineered from existing download URL, lines 207-209) | delete + upload + read URL | `imageRef.delete()` when replacing a same-named file (line 234), `put(File)` (line 236), `getDownloadURL()` (line 238) |
| 252-261 | `assets/{uuid}/documents/{fileName}` | delete + upload + read URL | same pattern for documents (lines 254, 256, 261) |

### 2.18 `src/app/asset/[saleId]/docs/page.tsx` (browser, documents tab)

| Line | Target | Operation | Details |
|---|---|---|---|
| 55 | Storage object behind each `documentUrls` entry | read (metadata) | `storage.refFromURL(item).getMetadata()`; uses `meta.size` for display. Only reads the FIRST document group (`Object.keys(...)[0]`, flagged `// Fixme:` at line 53). |
| 62-67 | `BusinessUser` | read | minter lookup by `asset.minterId`; uses `displayName` |

### 2.19 `src/app/marketplace/[assetClass]/page.tsx` (browser, category listing grid)

| Line | Collection | Operation | Details |
|---|---|---|---|
| 88-93 | `BusinessUser` | read | per-card owner lookup by `nft.nftOwner`; uses `displayName`, `logo` |

(Asset data comes from `assetStore.fetchAssets`, 2.5; category filters from `categoryStore`, 2.6.)

### 2.20 `src/app/business/dashboard/page.tsx` (browser)

| Line | Collection | Operation | Details |
|---|---|---|---|
| 72-94 | `BusinessUser` | read | own profile; gates on `isVerified`, redirects to `/verify-business` when false |

### 2.21 `src/app/business/list-new-asset/page.tsx` (browser)

| Line | Collection | Operation | Details |
|---|---|---|---|
| 86-101 | `BusinessUser` | read | own profile; gates on `isVerified` |

(The actual writes happen in `list-modal.tsx`, 2.8, which this page renders.)

### 2.22 `src/app/profile/[userId]/page.tsx` (browser, public business profile)

| Line | Collection | Operation | Details |
|---|---|---|---|
| 67-70 | `BusinessUser` | read | doc get by route param `params.userId`, typed `BusinessUser` |

## 3. Firebase Storage summary

Bucket layout (all uploads from the browser with the compat SDK):

- `assets/{uuidv4}/images/{originalFileName}`: asset photos. Written at `src/components/assets/list-modal.tsx:161-162` and `src/app/asset/[saleId]/update/page.tsx:232-236`. Deleted (replace) at `update/page.tsx:234`.
- `assets/{uuidv4}/documents/{originalFileName}`: ownership documents. Written at `list-modal.tsx:172-173` and `update/page.tsx:252-256`. Deleted (replace) at `update/page.tsx:254`.
- Download URLs (`getDownloadURL`, `list-modal.tsx:163,175`, `update/page.tsx:238,261`) are persisted inside the on-chain NFT metadata JSON (`imageUrls`, `documentUrls`), NOT in Firestore. Migration warning: the blockchain permanently stores `firebasestorage.googleapis.com` URLs for existing assets, so old objects must either stay readable at those URLs or be proxied; new uploads can move to Supabase Storage.
- Metadata reads: `src/app/asset/[saleId]/docs/page.tsx:55` (`refFromURL(...).getMetadata()` for file size). The update page also parses storage paths back out of the download URLs (`update/page.tsx:207-225`), which is fragile and Firebase-URL-format specific.
- `next.config.ts:14` allowlists `firebasestorage.googleapis.com` for `next/image`.

## 4. Document shapes as actually used in code

Types in `src/types/*.ts` are aspirational; the shapes below are what code reads and writes.

### RetailUser (doc id = wallet address)
- `createdAt: Date/Timestamp` (server write, `login.ts:40-44`)
- `fullName: string`, `email: string`, `phone: string` (profile page read/update; type file says `name` instead of `fullName`, and `asset/[saleId]/page.tsx:157` reads `name`)
- `settings: { language: string, currency: string, darkMode: boolean, preferences: { investmentUpdates, newsInsights, securityAlerts, transactionConfirmations: boolean } }` (settings page)
- `isVerified` is read at `profile/page.tsx:84` but never written for retail users (dead read; real flag is the `KYCIdentity` subcollection)

### RetailUser/{wallet}/Holding (auto id)
- `createdAt: string (ISO)`, `quantity: number`, `lockedQuantity: number`, `assetId: number` (nft id; queried once as `parseInt(assetId)` server-side), `assetCategory: string | null` (AssetCategory doc id, but category NAME in the transfer flow), `averageEntryPrice: number`

### RetailUser/{wallet}/KYCIdentity (auto id)
- `{ sumsubVerified: boolean }`; written only by the Sumsub webhook (server), read only at `asset/[saleId]/page.tsx:114`

### BusinessUser (doc id = wallet address)
- `createdAt: Date/Timestamp`, `isVerified: boolean` (login server action; webhook sets true)
- `displayName: string`, `legalName: string`, `email: string`, `phone: string` (profile page)
- `logo?: string` (read in many places; no write site in this repo, presumably seeded externally)
- `settings: { language, currency, darkMode, preferences: { securityAlerts, transactionAlerts } }` (settings page)

### Asset (doc id = NFT id as string)
- `internalId: string (uuid, links to Storage folder)`, `createdAt: string (ISO)`, `txHash: string`, `assetName: string`, `initialSupply: number`, `availableSupply: number`, `assetCategory: string (AssetCategory doc id)`, `minterId: string (wallet)`, `pricePerFraction: number`

### Asset/{id}/Listing (auto id)
- `createdAt: string (ISO)`, `quantity: number`, `pricePerFraction: number`, `currency: 'USDC'`, `state: 'ACTIVE' | 'CANCELED'` (enum exists but nothing ever writes CANCELED; unlisting deletes the doc), `assetId: number`, `listerId: string (wallet)`, `assetCategory?: string` (only on the initial mint listing)

### Asset/{id}/KYCRequirement (auto id)
- `{ sumsubVerified: boolean }`; presence of a `sumsubVerified == true` doc means "buyer must be KYC verified"

### Mint (auto id)
- `createdAt: string (ISO)`, `txHash: string`, `assetId: number`, `mintSupply: number`, `minterId: string (wallet)`, `mintPrice: number`, `mintCurrency: 'USDC'`, `mintFee: number (0)`

### Transaction (auto id)
- `date: string (ISO)`, `txHash: string`, `quantity: number`, `pricePerFraction: number`, `currency: 'USDC'`, `fee: number` (0 marks a transfer, purchase fee is platform fee split per source), `feeCurrency: 'USDC'`, `listingId: string` (misnamed; it holds the Asset doc id), `assetId: number`, `assetCategory: string | null` (id in purchase flow, NAME in transfer flow), `fromWallet: string`, `toWallet: string`

### AssetCategory (auto or seeded id) and AssetCategory/{id}/fields
- Category: `{ isEnabled: boolean, name: string, image: string }`
- fields docs: `FieldType` union (`src/constants.ts:1-38`). Read-only from this repo.

## 5. Migration notes (cross-cutting hazards)

1. **Dual write paths per purchase**: browser (`utils/purchaseSuccess.ts`) writes buyer Holding + Transactions while the server action (`actions/purchase-success.ts`) mutates Listings, seller Holdings, and the Asset, with no transaction and no idempotency. Collapse into one Postgres transaction / RPC.
2. **`FieldValue.increment`** used at 8 sites (purchaseSuccess.ts:36, transfer-modal.tsx:53,69, portfolio/page.tsx:264,268, portfolio/[purchaseId]/page.tsx:130,138). Map to atomic SQL updates.
3. **`assetId` type inconsistency**: stored as number (nft id) in Holding/Listing/Transaction/Mint, but the Asset primary key is the string doc id; server code bridges with `parseInt` (`actions/purchase-success.ts:39`) and clients with `.toString()` comparisons. Normalize to one type with a foreign key.
4. **`assetCategory` inconsistency**: doc id in mint and purchase flows, display NAME in the transfer flow (transfer-modal.tsx:74) and in Holding transfer copies. Normalize to a category FK.
5. **`createdAt` type inconsistency**: server writes JS Date (Timestamp), all client writes ISO strings; `assetStore` sorts assuming strings.
6. **Boolean-doc subcollections** (`KYCIdentity`, `KYCRequirement`) are just flags; in Postgres they become boolean columns (`retail_user.kyc_verified`, `asset.kyc_required`) instead of tables, unless audit history is wanted.
7. **Table choice by hostname** (`window.location.hostname.includes("business")`) at settings/page.tsx:44 and profile/page.tsx:34,117 picks `RetailUser` vs `BusinessUser`; the login server action picks by a `userType` argument. Keep this routing in mind when the two collections become tables.
8. **All client access is unauthenticated Firestore-rules territory**: the browser writes directly to Firestore with no Firebase Auth user, so rules are effectively open. Moving to Supabase, these become RLS decisions; most write sites should move server-side because identity is only a wallet address plus a thirdweb JWT cookie.
9. **No listeners, no pagination, no orderBy in queries**: every query is a full get with client-side sort/filter, so Postgres equivalents are simple selects.
10. **AssetCategory (+fields) and BusinessUser.logo have no write path in this repo**; data export from Firestore is required for them.

## 6. Summary table

| Collection | Fields observed in code | Written from | Read from |
|---|---|---|---|
| `RetailUser` | `createdAt`, `fullName`, `email`, `phone`, `settings{language, currency, darkMode, preferences{investmentUpdates, newsInsights, securityAlerts, transactionConfirmations}}`, (`name`, `isVerified` read-only, likely legacy) | server: `actions/login.ts:44` (create); browser: `profile/page.tsx:118`, `settings/page.tsx:78` | browser: `settings/page.tsx:58`, `profile/page.tsx:35`, `asset/[saleId]/page.tsx:103,148`, `asset/[saleId]/buy/.../page.tsx:103`, `portfolio/page.tsx:147`, `portfolio/[purchaseId]/page.tsx:49`, `portfolio/[purchaseId]/[listingId]/page.tsx:43`, `transfer-modal.tsx:119` |
| `RetailUser/{w}/Holding` | `createdAt`, `quantity`, `lockedQuantity`, `assetId` (number), `assetCategory`, `averageEntryPrice` | browser: `utils/purchaseSuccess.ts:35,41`, `transfer-modal.tsx:52,58,68`, `portfolio/page.tsx:267`, `portfolio/[purchaseId]/page.tsx:137`; server: `actions/purchase-success.ts:43` | browser: `utils/purchaseSuccess.ts:31`, `transfer-modal.tsx:55`, `portfolio/page.tsx:182`, `portfolio/[purchaseId]/page.tsx:58,134,182`, `portfolio/[purchaseId]/[listingId]/page.tsx:52`; server: `actions/purchase-success.ts:39` |
| `RetailUser/{w}/KYCIdentity` | `sumsubVerified` (bool) | server: `api/sumsub-webhook/route.ts:20` | browser: `asset/[saleId]/page.tsx:114` |
| `BusinessUser` | `createdAt`, `isVerified`, `displayName`, `legalName`, `email`, `phone`, `logo`, `settings{language, currency, darkMode, preferences{securityAlerts, transactionAlerts}}` | server: `actions/login.ts:44` (create), `api/sumsub-webhook/route.ts:15` (`isVerified`); browser: `profile/page.tsx:118`, `settings/page.tsx:78` | server: `hero-section.tsx:24`; browser: `settings/page.tsx:58`, `profile/page.tsx:35`, `profile/[userId]/page.tsx:67`, `asset/[saleId]/page.tsx:148,185`, `asset/[saleId]/docs/page.tsx:62`, `marketplace/[assetClass]/page.tsx:88`, `business/dashboard/page.tsx:72`, `business/list-new-asset/page.tsx:86`, `portfolio/page.tsx:193` |
| `Asset` | `internalId`, `createdAt`, `txHash`, `assetName`, `initialSupply`, `availableSupply`, `assetCategory`, `minterId`, `pricePerFraction` | browser: `list-modal.tsx:76` (set), `asset/[saleId]/update/page.tsx:129`, `portfolio/page.tsx:263`, `portfolio/[purchaseId]/page.tsx:129`, `portfolio/[purchaseId]/[listingId]/page.tsx:108`; server: `actions/purchase-success.ts:61` | browser: `store/assetStore.ts:25`, `asset/[saleId]/update/page.tsx:62,126`, `portfolio/[purchaseId]/page.tsx:117`, `portfolio/[purchaseId]/[listingId]/page.tsx:100`; server: `actions/purchase-success.ts:13`, `hero-section.tsx:17` |
| `Asset/{id}/Listing` | `createdAt`, `quantity`, `pricePerFraction`, `currency`, `state`, `assetId` (number), `listerId`, `assetCategory` (mint listing only) | browser: `list-modal.tsx:87` (add), `portfolio/[purchaseId]/page.tsx:120` (add), `asset/[saleId]/update/page.tsx:135` (update), `portfolio/[purchaseId]/[listingId]/page.tsx:107` (update), `portfolio/page.tsx:262` (delete); server: `actions/purchase-success.ts:34` (delete), `:36` (update) | browser: `asset/[saleId]/page.tsx:142`, `asset/[saleId]/buy/.../page.tsx:122`, `asset/[saleId]/update/page.tsx:133`, `portfolio/page.tsx:190,257`, `portfolio/[purchaseId]/[listingId]/page.tsx:59`; server: `actions/purchase-success.ts:16,53` |
| `Asset/{id}/KYCRequirement` | `sumsubVerified` (bool) | browser: `list-modal.tsx:99` (add), `asset/[saleId]/update/page.tsx:143` (add), `:148` (delete) | browser: `asset/[saleId]/page.tsx:127`, `asset/[saleId]/update/page.tsx:68,141` |
| `Mint` | `createdAt`, `txHash`, `assetId`, `mintSupply`, `minterId`, `mintPrice`, `mintCurrency`, `mintFee` | browser: `list-modal.tsx:104` (add) | never read in this repo |
| `Transaction` | `date`, `txHash`, `quantity`, `pricePerFraction`, `currency`, `fee`, `feeCurrency`, `listingId` (Asset id), `assetId`, `assetCategory`, `fromWallet`, `toWallet` | browser: `utils/purchaseSuccess.ts:53` (add), `transfer-modal.tsx:75` (add) | browser: `portfolio/page.tsx:172,173` |
| `AssetCategory` | `isEnabled`, `name`, `image` | none in repo (seeded externally) | browser: `store/categoryStore.ts:26`, `utils/purchaseSuccess.ts:24` |
| `AssetCategory/{id}/fields` | `FieldType`: `name`, `type`, `options?`, `min?`, `max?`, `filterOptions?`, `filter?` | none in repo | browser: `store/categoryStore.ts:31` |
| Storage `assets/{uuid}/images/*`, `assets/{uuid}/documents/*` | binary File objects; download URLs persisted in on-chain NFT metadata | browser: `list-modal.tsx:161-175`, `asset/[saleId]/update/page.tsx:232-261` (incl. deletes) | browser: `asset/[saleId]/docs/page.tsx:55` (metadata); URLs consumed via `next/image` everywhere (`next.config.ts:14`) |
