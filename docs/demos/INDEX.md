# Demo videos

One video per product function, recorded by Playwright against the local
stack (hardhat chain, seeded Supabase database, live chain indexer) with
actions slowed to about 400 ms. Every clip runs from the first click to the
confirmed result, including the on chain confirmation and the updated
database state as the UI shows it.

Two things in the frame come from test mode and do not exist in production:
the "Log out test wallet" button in the header (the suite signs with a local
key instead of the thirdweb in-app wallet) and the mock payment provider page
in the card flow (production uses Transak). Everything else, including the
on-chain transactions and the indexer settling them, is real.

Recorded set: 31 videos, 3.1 MB total.

Regenerate with `npm run demos` (add `-- --upload` to publish to Supabase
Storage and link the public URLs here instead of the local files).

| # | Role | Function | Duration | Video |
| --- | --- | --- | --- | --- |
| 00 | full | business lists an asset, an investor buys with a card and resells, a second investor buys the resale | 0:01 | [00-full-journey.mp4](./00-full-journey.mp4) |
| 01 | business | completes the business profile | 0:05 | [01-business-completes-the-business-profile.mp4](./01-business-completes-the-business-profile.mp4) |
| 02 | business | creates a draft listing with per-class fields, image and document | 0:08 | [02-business-creates-a-draft-listing-with-per-class-fields-image-and-docu.mp4](./02-business-creates-a-draft-listing-with-per-class-fields-image-and-docu.mp4) |
| 03 | business | delists the remaining fractions | 0:04 | [03-business-delists-the-remaining-fractions.mp4](./03-business-delists-the-remaining-fractions.mp4) |
| 04 | business | edits the draft and shows the Coming soon card in the marketplace | 0:04 | [04-business-edits-the-draft-and-shows-the-coming-soon-card-in-the-market.mp4](./04-business-edits-the-draft-and-shows-the-coming-soon-card-in-the-market.mp4) |
| 05 | business | is verified through the signed Sumsub webhook | 0:04 | [05-business-is-verified-through-the-signed-sumsub-webhook.mp4](./05-business-is-verified-through-the-signed-sumsub-webhook.mp4) |
| 06 | business | mints and lists the asset on the local chain | 0:09 | [06-business-mints-and-lists-the-asset-on-the-local-chain.mp4](./06-business-mints-and-lists-the-asset-on-the-local-chain.mp4) |
| 07 | business | persists settings updates | 0:03 | [07-business-persists-settings-updates.mp4](./07-business-persists-settings-updates.mp4) |
| 08 | business | registers on first login and lands behind the verification gate | 0:03 | [08-business-registers-on-first-login-and-lands-behind-the-verification-g.mp4](./08-business-registers-on-first-login-and-lands-behind-the-verification-g.mp4) |
| 09 | business | rejects an invalid listing form with validation messages | 0:03 | [09-business-rejects-an-invalid-listing-form-with-validation-messages.mp4](./09-business-rejects-an-invalid-listing-form-with-validation-messages.mp4) |
| 10 | business | shows the asset with the sales view on the dashboard | 0:02 | [10-business-shows-the-asset-with-the-sales-view-on-the-dashboard.mp4](./10-business-shows-the-asset-with-the-sales-view-on-the-dashboard.mp4) |
| 11 | business | shows transactions and revenue on the dashboard | 0:02 | [11-business-shows-transactions-and-revenue-on-the-dashboard.mp4](./11-business-shows-transactions-and-revenue-on-the-dashboard.mp4) |
| 12 | business | updates the listing metadata and primary price | 0:03 | [12-business-updates-the-listing-metadata-and-primary-price.mp4](./12-business-updates-the-listing-metadata-and-primary-price.mp4) |
| 13 | investor | registers through test auth and completes the profile | 0:04 | [13-investor-registers-through-test-auth-and-completes-the-profile.mp4](./13-investor-registers-through-test-auth-and-completes-the-profile.mp4) |
| 14 | investor | browses the marketplace with search, class and field filters | 0:06 | [14-investor-browses-the-marketplace-with-search-class-and-field-filters.mp4](./14-investor-browses-the-marketplace-with-search-class-and-field-filters.mp4) |
| 15 | investor | opens the asset detail page and its documents | 0:02 | [15-investor-opens-the-asset-detail-page-and-its-documents.mp4](./15-investor-opens-the-asset-detail-page-and-its-documents.mp4) |
| 16 | investor | KYC gate blocks an unverified buyer and lifts after the signed webhook | 0:04 | [16-investor-kyc-gate-blocks-an-unverified-buyer-and-lifts-after-the-sign.mp4](./16-investor-kyc-gate-blocks-an-unverified-buyer-and-lifts-after-the-sign.mp4) |
| 17 | investor | buys with USDC: approve, buyFractions, indexer settlement, portfolio | 0:10 | [17-investor-buys-with-usdc.mp4](./17-investor-buys-with-usdc.mp4) |
| 18 | investor | buys with card through the mock onramp: awaiting_funds, funded, settled | 0:01 | [18-investor-buys-with-card-through-the-mock-onramp.mp4](./18-investor-buys-with-card-through-the-mock-onramp.mp4) |
| 19 | investor | card payment failure (magic 13) shows a clear failed state with retry | 0:01 | [19-investor-card-payment-failure-magic-13-shows-a-clear-failed-state-wit.mp4](./19-investor-card-payment-failure-magic-13-shows-a-clear-failed-state-wit.mp4) |
| 20 | investor | lists fractions for resale and the secondary listing appears | 0:08 | [20-investor-lists-fractions-for-resale-and-the-secondary-listing-appears.mp4](./20-investor-lists-fractions-for-resale-and-the-secondary-listing-appears.mp4) |
| 21 | investor | updates the resale listing price | 0:08 | [21-investor-updates-the-resale-listing-price.mp4](./21-investor-updates-the-resale-listing-price.mp4) |
| 22 | investor | unlists the resale listing | 0:08 | [22-investor-unlists-the-resale-listing.mp4](./22-investor-unlists-the-resale-listing.mp4) |
| 23 | investor | transfers fractions to another user and the indexer moves balances | 0:08 | [23-investor-transfers-fractions-to-another-user-and-the-indexer-moves-ba.mp4](./23-investor-transfers-fractions-to-another-user-and-the-indexer-moves-ba.mp4) |
| 24 | investor | the recipient sees the transferred fractions in their portfolio | 0:04 | [24-investor-the-recipient-sees-the-transferred-fractions-in-their-portfo.mp4](./24-investor-the-recipient-sees-the-transferred-fractions-in-their-portfo.mp4) |
| 25 | investor | transaction history lists every operation of the journey | 0:03 | [25-investor-transaction-history-lists-every-operation-of-the-journey.mp4](./25-investor-transaction-history-lists-every-operation-of-the-journey.mp4) |
| 26 | investor | display currency changes the prices shown | 0:11 | [26-investor-display-currency-changes-the-prices-shown.mp4](./26-investor-display-currency-changes-the-prices-shown.mp4) |
| 27 | investor | settings preferences persist through the server action | 0:03 | [27-investor-settings-preferences-persist-through-the-server-action.mp4](./27-investor-settings-preferences-persist-through-the-server-action.mp4) |
| 28 | investor | logs out and back in with state intact | 0:07 | [28-investor-logs-out-and-back-in-with-state-intact.mp4](./28-investor-logs-out-and-back-in-with-state-intact.mp4) |
| 29 | system | RLS blocks cross-user holdings reads and anon sees only public data | 0:01 | [29-system-rls-blocks-cross-user-holdings-reads-and-anon-sees-only-publ.mp4](./29-system-rls-blocks-cross-user-holdings-reads-and-anon-sees-only-publ.mp4) |
| 30 | system | the losing buyer sees a clear failure message in the buy flow UI | 0:12 | [30-system-the-losing-buyer-sees-a-clear-failure-message-in-the-buy-flo.mp4](./30-system-the-losing-buyer-sees-a-clear-failure-message-in-the-buy-flo.mp4) |

## Descriptions

### 00-full-journey.mp4

End to end walkthrough: a business registers, verifies, mints and lists an asset, an investor buys with a card, resells, and a second investor buys the resale.
Every step is confirmed on chain and reflected in the dashboard, portfolio and transaction history.

### 01-business-completes-the-business-profile.mp4

completes the business profile

### 02-business-creates-a-draft-listing-with-per-class-fields-image-and-docu.mp4

creates a draft listing with per-class fields, image and document

### 03-business-delists-the-remaining-fractions.mp4

delists the remaining fractions

### 04-business-edits-the-draft-and-shows-the-coming-soon-card-in-the-market.mp4

edits the draft and shows the Coming soon card in the marketplace

### 05-business-is-verified-through-the-signed-sumsub-webhook.mp4

is verified through the signed Sumsub webhook

### 06-business-mints-and-lists-the-asset-on-the-local-chain.mp4

mints and lists the asset on the local chain

### 07-business-persists-settings-updates.mp4

persists settings updates

### 08-business-registers-on-first-login-and-lands-behind-the-verification-g.mp4

registers on first login and lands behind the verification gate

### 09-business-rejects-an-invalid-listing-form-with-validation-messages.mp4

rejects an invalid listing form with validation messages

### 10-business-shows-the-asset-with-the-sales-view-on-the-dashboard.mp4

shows the asset with the sales view on the dashboard

### 11-business-shows-transactions-and-revenue-on-the-dashboard.mp4

shows transactions and revenue on the dashboard

### 12-business-updates-the-listing-metadata-and-primary-price.mp4

updates the listing metadata and primary price

### 13-investor-registers-through-test-auth-and-completes-the-profile.mp4

registers through test auth and completes the profile

### 14-investor-browses-the-marketplace-with-search-class-and-field-filters.mp4

browses the marketplace with search, class and field filters

### 15-investor-opens-the-asset-detail-page-and-its-documents.mp4

opens the asset detail page and its documents

### 16-investor-kyc-gate-blocks-an-unverified-buyer-and-lifts-after-the-sign.mp4

KYC gate blocks an unverified buyer and lifts after the signed webhook

### 17-investor-buys-with-usdc.mp4

buys with USDC: approve, buyFractions, indexer settlement, portfolio

### 18-investor-buys-with-card-through-the-mock-onramp.mp4

buys with card through the mock onramp: awaiting_funds, funded, settled

### 19-investor-card-payment-failure-magic-13-shows-a-clear-failed-state-wit.mp4

card payment failure (magic 13) shows a clear failed state with retry

### 20-investor-lists-fractions-for-resale-and-the-secondary-listing-appears.mp4

lists fractions for resale and the secondary listing appears

### 21-investor-updates-the-resale-listing-price.mp4

updates the resale listing price

### 22-investor-unlists-the-resale-listing.mp4

unlists the resale listing

### 23-investor-transfers-fractions-to-another-user-and-the-indexer-moves-ba.mp4

transfers fractions to another user and the indexer moves balances

### 24-investor-the-recipient-sees-the-transferred-fractions-in-their-portfo.mp4

the recipient sees the transferred fractions in their portfolio

### 25-investor-transaction-history-lists-every-operation-of-the-journey.mp4

transaction history lists every operation of the journey

### 26-investor-display-currency-changes-the-prices-shown.mp4

display currency changes the prices shown

### 27-investor-settings-preferences-persist-through-the-server-action.mp4

settings preferences persist through the server action

### 28-investor-logs-out-and-back-in-with-state-intact.mp4

logs out and back in with state intact

### 29-system-rls-blocks-cross-user-holdings-reads-and-anon-sees-only-publ.mp4

RLS blocks cross-user holdings reads and anon sees only public data

### 30-system-the-losing-buyer-sees-a-clear-failure-message-in-the-buy-flo.mp4

the losing buyer sees a clear failure message in the buy flow UI

