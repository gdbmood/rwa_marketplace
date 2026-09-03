# Firestore to Supabase data migration

`scripts/migrate-firestore-to-supabase.ts` is a standalone, one-shot script that reads the
legacy Firebase (Firestore) project and upserts everything into the new Supabase schema
(`supabase/migrations/20260903000001_initial_schema.sql` and later). It is idempotent:
running it twice produces the same rows, not duplicates.

## Prerequisites

- The Supabase migrations must already be applied (including the seeded asset categories
  and the `business_profiles` table).
- `firebase-admin` is being removed from the app dependencies. Install it ad hoc for the
  migration run only:

  ```sh
  npm install firebase-admin --no-save
  ```

- `@supabase/supabase-js` is a regular app dependency and is used for all writes.

## Environment variables

| Variable | Meaning |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Path to the OLD Firebase project service account JSON file, or the JSON pasted inline. |
| `SUPABASE_URL` | Supabase project URL, e.g. `https://xyz.supabase.co`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (writes bypass RLS; the anon key will not work). |
| `MIGRATION_CHAIN_ID` | Chain id stamped on every migrated asset (`assets.chain_id` is NOT NULL). Falls back to `NEXT_PUBLIC_THIRDWEB_CHAIN_ID`. |

The script fails fast with a clear message when any of these is missing.

## Running

Dry run first. It reads Firestore and the existing `asset_categories`, prints
per-collection counts and the first 2 mapped rows per target table, and writes nothing
to Supabase:

```sh
npx tsx scripts/migrate-firestore-to-supabase.ts --dry-run
```

Live run:

```sh
npx tsx scripts/migrate-firestore-to-supabase.ts
```

At the end the script prints a summary table (firestore collection, docs read, rows
upserted, skipped, errors) and exits nonzero when any row errored. It also writes
`migration-output/id-map.json`, a map from every Firestore document path to the Supabase
uuid it became (in dry runs the uuids are deterministic placeholders and the file is
flagged with `"dryRun": true`). The map is used in memory for foreign key resolution
during the run and kept on disk for auditing.

## Mapping table

| Firestore source | Supabase target | Upsert key | Notes |
|---|---|---|---|
| `RetailUser/{wallet}` | `users` (`type = 'retail'`) | `wallet_address` (lowercased) | `fullName` (falling back to `name`) becomes `name`; `settings` copied as jsonb; `is_verified` derived from the legacy `isVerified` flag or any `KYCIdentity` doc with `sumsubVerified = true`. |
| `BusinessUser/{wallet}` | `users` (`type = 'business'`) plus `business_profiles` | `wallet_address` / `user_id` | `displayName`, `legalName`, `logo`, `email`, `phone`, `settings`, `isVerified` map to the matching columns; `business_profiles` gets `display_name` and `logo_url`. |
| `RetailUser/*/KYCIdentity`, `BusinessUser/*/KYCIdentity` | `kyc_identities` | deterministic uuid from the doc path | `provider = 'sumsub'`; `status = 'approved'` when `sumsubVerified = true`, else `'pending'`; the original doc is kept in `raw_payload`. |
| `AssetCategory/{id}` plus `fields` subcollection | `asset_categories` | matched by `name` against the seeded rows; new names insert on `slug` | Matched categories are updated only when `isEnabled` or the field schema actually differs (fields compared order-insensitively). The legacy `image` URL has no column and is dropped. The `fields` subcollection is folded into the `fields` jsonb. |
| `Asset/{nftId}` | `assets` | `nft_id` | `assetName` to `name`, `initialSupply` to `total_supply`, `availableSupply` to `available_supply`, `txHash` to `mint_tx_hash`, `internalId` to `internal_id`, `pricePerFraction` to `floor_price_per_fraction`; `mint_price_per_fraction` recovered from the matching `Mint` doc; `kyc_required` true when any `KYCRequirement` doc has `sumsubVerified = true`; status is `active` (the NFT exists for every Firestore asset) or `sold_out` when `availableSupply` is 0; the full legacy doc is preserved in `metadata.legacy`; `chain_id` comes from `MIGRATION_CHAIN_ID`. |
| `Asset/*/KYCRequirement` | folded into `assets.kyc_required` | n/a | Counted as read and skipped; no rows of their own. |
| `Asset/*/Listing` | `listings` | deterministic uuid from the doc path | `kind = 'primary'` when the lister is a business wallet (any `BusinessUser` doc or any asset minter), else `'secondary'`; `status = 'active'` when `quantity > 0`, else `'filled'`; `original_quantity` is not stored in Firestore, so it is set to the current quantity (1 for emptied listings). Duplicate active listings with the same asset, lister and price are merged to satisfy the schema's partial unique index. |
| `RetailUser/*/Holding` | `holdings` | `(user_id, asset_id)` | `assetId` (the NFT number) resolves through `assets.nft_id`. Multiple legacy docs for the same user and asset are merged: quantities summed, entry price quantity-weighted, earliest `createdAt` kept. `lockedQuantity` is clamped to `quantity` when legacy data violates the check constraint (warned, not fatal). The legacy `assetCategory` denormalization is dropped (the category lives on the asset). |
| `Mint/{id}` | `transactions` (`type = 'mint'`) | deterministic uuid (`tx_hash` and `log_index` also populated) | `mintSupply` to `quantity`, `mintPrice` to `price_per_fraction`, `mintFee` to `fee`, minter as `to_wallet` / `to_user_id`, `total = quantity * price`. |
| `Transaction/{id}` | `transactions` (`type = 'buy'` or `'transfer'`) | deterministic uuid (`tx_hash` and `log_index` also populated) | `fee > 0` means a purchase (`buy`), `fee = 0` means a wallet transfer (`transfer`), matching the legacy write sites. `date` to `created_at`, wallets lowercased and resolved to `from_user_id` / `to_user_id` when the user exists. The legacy `listingId` field actually held the Asset doc id and is intentionally NOT mapped to `transactions.listing_id`; `asset_id` covers it. Because legacy purchases write one doc per fill source sharing one `txHash`, rows in a shared `tx_hash` group get a stable `log_index` (0..n-1, ordered by deterministic id) so the `(tx_hash, log_index)` unique key holds. |
| Referenced wallets with no user doc | `users` stub rows | `wallet_address` | Wallets that appear as lister, minter, or transaction counterparty but have no `RetailUser` / `BusinessUser` doc get a minimal stub row (business type when the wallet minted an asset, retail otherwise) so foreign keys resolve. Reported in the summary as a separate line. |

## Behavior details

- Wallet addresses are always lowercased before writing (schema check constraints).
- A wallet present in both `RetailUser` and `BusinessUser` becomes ONE `users` row with
  `type = 'business'`; business fields win and retail-only fields are kept. A warning is
  printed for each such collision.
- Assets whose `assetCategory` cannot be resolved (including the legacy `'other'`
  sentinel) are attached to a fallback `Other` category, created on demand.
- Firestore `createdAt` values are normalized to ISO timestamps whether they were stored
  as Firestore Timestamps (server writes) or ISO strings (client writes).
- Known legacy quirk, preserved as-is: rows written by the transfer flow have
  `from_wallet` and `to_wallet` swapped relative to the real direction (the legacy code
  wrote the recipient into `fromWallet`). The migration copies the stored values
  faithfully rather than guessing the correction.
- Writes go out in chunks of 500; when a chunk fails it is retried row by row so a single
  bad row cannot sink the batch.
- Unresolvable foreign keys (a holding or listing pointing at an asset that was not
  migrated, for example) are counted as errors and make the exit code nonzero.
  Migratable oddities (clamped locked quantities, merged duplicates, unresolved
  categories) are warnings and do not fail the run.
