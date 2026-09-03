# Fiat on-ramp: provider research, decision and architecture

Research date: 2026-09-03. All links were checked on that date with automated
fetches; where a page could not be fetched directly this document says so
instead of guessing. Companion docs: docs/architecture/IMPLEMENTATION_PLAN.md
(WS3 scope, order state machine) and docs/PRODUCT_KNOWLEDGE.md section (c)
(the recorded operative choice: thirdweb primary, Stripe plus onramp
fallback).

## 1. Decision

Updated 2026-09-03 (user decision): **Transak is the accepted on-ramp path
for production**, because thirdweb Pay does not support UAE users (the launch
market). **EUR or USD are acceptable fiat currencies; AED is not required.**
Transak is now fully implemented behind the provider-agnostic
`OnrampProvider` interface (`src/lib/onramp/transak.ts`, no longer a stub)
and is the default provider; see section 5 for implementation status and the
activation checklist. thirdweb Bridge.Onramp remains implemented
(`src/lib/onramp/thirdweb.ts`) and selectable via `ONRAMP_PROVIDER=thirdweb`.
A deterministic mock provider (`src/lib/onramp/mock.ts`) is wired when
`TEST_MODE=1`.

Historical context, reasons thirdweb was originally primary:

- It is the operative choice recorded in docs/PRODUCT_KNOWLEDGE.md (fork
  spec: "use thirdweb Checkout/Pay for embedded card -> auto onramp to USDC",
  labeled Option A, fastest). No formal decision page exists; the dedicated
  Notion page is blank and On hold since 2023.
- The repo already runs thirdweb v5 (wallets, auth, contract calls) and holds
  a `THIRDWEB_SECRET_KEY`; Bridge.Onramp.prepare and Bridge.Onramp.status are
  in the installed SDK (thirdweb 5.105.37, verified against
  `node_modules/thirdweb/dist/types/bridge/Onramp.d.ts` and
  `OnrampStatus.d.ts`).
- One integration fans out to three sub-providers (Coinbase, Stripe, Transak)
  with a single session id, status API and signed webhook.

Known material risk: thirdweb's own FAQ lists the United Arab Emirates as an
unsupported region (section 2 below). For a UAE-focused launch this makes the
Transak fallback a realistic near-term need, which is why the stub and the
interface exist now.

## 2. Research findings (2026-09-03)

### 2.1 thirdweb Payments onramp

- Providers: "Payments supports the following onramp providers: Coinbase,
  Transak, Stripe". Each has different supported regions; fees are set by the
  provider, not thirdweb.
  Source: https://portal.thirdweb.com/payments/onramp-providers (fetched
  2026-09-03).
- Coverage: "Buy With Fiat is available 160+ countries". Apple Pay is
  supported through Coinbase, Stripe and Transak; Google Pay only through
  Transak. Minimal KYC applies; Coinbase requires no KYC below 500 USD with a
  debit card.
  Source: https://portal.thirdweb.com/payments/faq (fetched 2026-09-03).
- UAE: the same FAQ lists unsupported regions verbatim as "Afghanistan,
  Africa (All Countries), Belarus, Bolivia, China, Cuba, Colombia, Haiti,
  Honduras, Iran, Iraq, Latvia, Lebanon, Myanmar, Pakistan, Qatar, Russia,
  Ukraine, United Arab Emirates, Venezuela, Yemen". The United Arab Emirates
  is explicitly on the unsupported list as of 2026-09-03.
  Source: https://portal.thirdweb.com/payments/faq (fetched 2026-09-03).
- Fiat currency list: the thirdweb docs pages fetched (portal.thirdweb.com/pay,
  /payments/onramp-providers, /payments/faq) do not publish a per-currency
  list. AED support through thirdweb is therefore undocumented; combined with
  the UAE exclusion above, assume thirdweb cannot serve AED cards from UAE
  users today. `Bridge.Onramp.prepare` accepts a `currency` parameter and a
  `country` parameter ("This will return an error if the user's country is
  not supported by the provider", per the SDK JSDoc), so unsupported
  combinations fail fast at session creation.
- Card networks: not published on the fetched thirdweb pages. Sub-provider
  card support applies (Coinbase debit cards; Stripe cards in its supported
  regions; Transak Visa and Mastercard credit and debit).

### 2.2 Sub-provider coverage relevant to UAE and AED

- Stripe crypto onramp: available to US consumers only ("available for US
  consumers to start"). Not a path to AED.
  Sources: https://stripe.com/blog/crypto-onramp and
  https://docs.stripe.com/crypto/onramp (checked via web search 2026-09-03).
- Coinbase onramp: 90+ countries, but Coinbase retail service is not
  available in the UAE as of 2025 reporting; not a path to AED cards.
  Sources: https://docs.cdp.coinbase.com/onramp/coinbase-hosted-onramp/countries-&-currencies
  and https://fintechfinder.com/uae/blog/coinbase-uae/ (checked via web
  search 2026-09-03).
- Transak direct: Transak's own country pages advertise buying crypto in the
  United Arab Emirates with AED using credit cards, Apple Pay, Google Pay and
  bank transfer. Note: transak.com and support.transak.com returned HTTP 403
  to direct automated fetches on 2026-09-03 (bot protection), so this
  finding rests on search-result snippets of
  https://transak.com/buy/ltc/united-arab-emirates,
  https://transak.com/global-coverage and
  https://support.transak.com/en/articles/7846056-countries-and-crypto-supported-by-transak
  retrieved 2026-09-03, not on a full page fetch. Verify in a browser before
  committing to the fallback.

### 2.3 Consequence for UAE users and AED cards

Through thirdweb today: unsupported (UAE is on thirdweb's own exclusion
list, regardless of sub-provider). Directly through Transak: supported per
Transak's public pages (AED, cards, Apple Pay, Google Pay). Therefore the
UAE launch market most likely requires activating the Transak fallback
(section 5) or a commercial arrangement with thirdweb to lift the exclusion.
This is an open product decision; the code keeps both doors open.

## 3. Architecture

### 3.1 Interface (src/lib/onramp/types.ts)

```
OnrampProvider {
  name
  createSession({ userId, orderId, wallet, fiatCurrency, fiatAmount?, tokenAmount, chainId })
    -> { providerSessionId, redirectUrl? | widgetData?, quote }
  getSessionStatus(providerSessionId) -> created | pending | completed | failed | canceled
  parseWebhook(request) -> OnrampWebhookEvent | null
}
```

Statuses are exactly the `onramp_status` database enum. Money follows the
repo conventions: `tokenAmount` and quote amounts are numeric strings in
USDC units; conversion to on-chain bigint micro USDC happens only in
`src/lib/onramp/usdc.ts`.

Provider selection (`src/lib/onramp/index.ts`): `TEST_MODE=1` selects the
mock, otherwise `ONRAMP_PROVIDER` picks `thirdweb` or `transak`. The default
is `transak` (UAE decision, section 1).

### 3.2 thirdweb implementation (src/lib/onramp/thirdweb.ts)

- `createSession` calls `Bridge.Onramp.prepare` with a server-side client
  built from `THIRDWEB_SECRET_KEY`, destination USDC
  (`NEXT_PUBLIC_USDC_CONTRACT_ADDRESS`) on the active chain
  (`NEXT_PUBLIC_THIRDWEB_CHAIN_ID`), receiver = the user's wallet, amount =
  order total in micro USDC, and `purchaseData: { orderId, userId }`. The
  fiat sub-provider is `THIRDWEB_ONRAMP_PROVIDER` (coinbase | stripe |
  transak, default coinbase). The returned `link` is the hosted checkout
  redirect URL; `id`, `currency`, `currencyAmount` and `destinationAmount`
  populate the session row and quote.
- `getSessionStatus` calls `Bridge.Onramp.status` and maps
  CREATED/PENDING/COMPLETED/FAILED onto the enum (unknown values map to
  pending so a new provider status can never falsely terminalize a session).
- `parseWebhook` verifies the Universal Bridge webhook signature with
  `Bridge.Webhook.parse` and `THIRDWEB_WEBHOOK_SECRET`, handles only
  `pay.onramp-transaction` events, and returns the mapped status plus
  receiver wallet and delivery tx hash.

### 3.3 Flow (order state machine tie-in)

```
POST /api/onramp/create   requireUser; order must be caller-owned, status created
  -> provider.createSession, insert onramp_sessions (status created)
  -> order: created -> awaiting_funds (payment_method onramp)
  -> { sessionId, redirectUrl, quote }

buyer pays on the provider's hosted page

GET /api/onramp/status?sessionId=...   requireUser; caller must own the session
  -> when not terminal: poll provider, persist status
POST /api/onramp/webhook               signature-verified, idempotent
  -> same settlement path as the poll

on completed (either path, exactly once):
  order: created|awaiting_funds -> funded
  transactions row: type onramp, total = token amount USDC
on failed or canceled:
  order: created|awaiting_funds -> failed (failure_reason onramp_failed | onramp_canceled)
  a funded or later order is never regressed
```

After funded, the client executes the on-chain purchase and the flow merges
with the direct USDC path (IMPLEMENTATION_PLAN.md, Buy flow).

Idempotency: the order transition is a guarded conditional update, so a
webhook racing a status poll settles the order once; the ledger row is only
written by the transition winner; terminal sessions ignore further events.

### 3.4 Mock provider (TEST_MODE=1)

`createSession` returns `mock_<uuid>` and redirect `/onramp/mock?session=...`
(the page is WS4 frontend scope). Status advances one step per poll using
the state stored in the DB row: created -> pending -> completed. A session
created with fiat amount exactly 13 goes created -> pending -> failed.
`parseWebhook` accepts a plain JSON `{ providerSessionId, status }` so e2e
tests can force transitions.

## 4. Environment variables

| Var | Status | Purpose |
| --- | --- | --- |
| `THIRDWEB_SECRET_KEY` | exists in src/lib/env.ts | server-side Bridge.Onramp calls |
| `NEXT_PUBLIC_USDC_CONTRACT_ADDRESS` | exists | destination token |
| `NEXT_PUBLIC_THIRDWEB_CHAIN_ID` | exists | destination chain |
| `THIRDWEB_WEBHOOK_SECRET` | NEW, read via process.env in src/lib/onramp/thirdweb.ts | verifies webhook signatures; set when creating the webhook in the thirdweb dashboard pointing at /api/onramp/webhook |
| `THIRDWEB_ONRAMP_PROVIDER` | NEW, optional | fiat sub-provider: coinbase (default), stripe, transak |
| `TEST_MODE` | plan-defined | 1 selects the mock provider |
| `ONRAMP_PROVIDER` | exists in src/lib/env.ts, optional | active provider: transak (default) or thirdweb |
| `TRANSAK_API_KEY` | exists in src/lib/env.ts | Transak partner API key (widget URL, order polling); from the Transak partner dashboard |
| `TRANSAK_API_SECRET` | exists in src/lib/env.ts | Transak partner API secret; mints 7-day partner access tokens used for order polling and webhook verification |
| `TRANSAK_ENVIRONMENT` | exists in src/lib/env.ts, optional | STAGING (default) or PRODUCTION; switches widget and API hosts |

Note: the previously planned `TRANSAK_WEBHOOK_SECRET` variable was dropped.
Transak signs webhook payloads with the partner access token (minted from
`TRANSAK_API_SECRET`), not with a separate webhook secret; verified against
live docs, section 5.2.

## 5. Transak implementation (default provider)

Status: **implemented** in `src/lib/onramp/transak.ts` (2026-09-03), unit
tested in `src/lib/onramp/__tests__/transak.test.ts`. It needs Transak
partner credentials (`TRANSAK_API_KEY`, `TRANSAK_API_SECRET`) to activate;
until Med's partner account exists, every call fails fast with a clear
`MissingEnvError`. `TRANSAK_ENVIRONMENT` defaults to STAGING so the first
credentials can be exercised safely against Transak's staging stack before
`PRODUCTION` is set.

### 5.1 How it maps onto the interface

- `createSession` builds the hosted widget URL locally (no network call):
  `https://global-stg.transak.com` (STAGING) or `https://global.transak.com`
  (PRODUCTION) with `apiKey`, `environment`, `fiatCurrency` (USD default,
  EUR supported; anything else falls back to USD and the returned quote says
  so), `cryptoCurrencyCode=USDC`, `network=base` (chain ids 8453 and 84532),
  `walletAddress` plus `disableWalletAddressForm=true` (delivery locked to
  the buyer's marketplace wallet), `partnerCustomerId=users.id` and
  `partnerOrderId=transak_<uuid>`. That generated partnerOrderId is our
  provider session id: Transak echoes it in every webhook and accepts it as
  an order filter, so correlation works before Transak assigns its own order
  id. `defaultCryptoAmount` (or `defaultFiatAmount` when the caller pinned a
  fiat hint) pre-fills the amount; the quote's fiat amount stays null unless
  pinned because Transak quotes fees inside the widget.
- `getSessionStatus` polls `GET /partners/api/v2/orders` with
  `filter[partnerOrderId]`, authenticated by `x-api-key` plus a partner
  access token (`POST /partners/api/v2/refresh-token` with the API secret;
  cached until shortly before its 7-day expiry, refreshed once on a 401). No
  order yet maps to `created`; any COMPLETED order among widget retries wins;
  otherwise the newest order's status is mapped.
- `parseWebhook` expects Transak's `{ "data": "<JWT>" }` body, verifies the
  JWT with the current partner access token (HS256 pinned, constant-time
  compare, one forced token refresh before rejecting in case Transak rotated
  it), handles only `ORDER_*` events (KYC events return null), correlates by
  `webhookData.partnerOrderId` and persists the decoded payload as
  `raw_payload`.

### 5.2 Status mapping (conservative)

Only COMPLETED, FAILED and CANCELLED are terminal. Everything else maps to
`pending` so a provider status can never falsely terminalize a session; the
raw payload keeps Transak's exact status for ops review.

| Transak order status | onramp_status |
| --- | --- |
| AWAITING_PAYMENT_FROM_USER | pending |
| PAYMENT_DONE_MARKED_BY_USER | pending |
| PROCESSING | pending |
| PENDING_DELIVERY_FROM_TRANSAK | pending |
| ON_HOLD_PENDING_DELIVERY_FROM_TRANSAK | pending |
| COMPLETED | completed |
| FAILED | failed |
| CANCELLED | canceled |
| EXPIRED | pending (deliberate: not on the agreed terminal list; ops resolves via raw_payload) |
| REFUNDED | pending (same reasoning; a refund after completion never regresses the session anyway) |
| anything unknown | pending |

### 5.3 Verified against live docs vs modeled

Verified by fetching docs.transak.com on 2026-09-03:

- Widget query parameters and semantics: `apiKey`, `environment`
  (STAGING | PRODUCTION), `fiatCurrency` (locks the currency),
  `fiatAmount` (locks) and `defaultFiatAmount` (pre-fills),
  `cryptoCurrencyCode`, `network`, `walletAddress`,
  `disableWalletAddressForm`, `partnerOrderId` (echoed in webhooks),
  `partnerCustomerId`, `redirectURL` (docs/query-parameters).
- Staging widget host `https://global-stg.transak.com`
  (docs/integration-options).
- Access token API: `POST https://api-stg.transak.com/partners/api/v2/refresh-token`,
  headers `x-api-key` and `api-secret`, body `{ apiKey }`, response
  `{ data: { accessToken, expiresAt } }`, 7-day validity
  (reference/refresh-access-token).
- Orders API: `GET .../partners/api/v2/orders` with headers `x-api-key` and
  `access-token`, `filter[partnerOrderId]` exact match, `limit`, `skip`,
  `filter[sortOrder]` (reference/get-orders); single order by Transak id at
  `GET .../partners/api/v2/order/{orderId}` (reference/get-order-by-order-id).
- Webhook model: POST body `{ "data": "<JWT>" }`, JWT signed HS256 and
  verified with the partner access token (their example uses
  `jsonwebtoken.verify(data, accessToken)`); decoded shape
  `{ eventID, createdAt, webhookData: { id, status, walletAddress,
  transactionHash, ... } }`; order event ids ORDER_CREATED,
  ORDER_PAYMENT_VERIFYING, ORDER_PROCESSING, ORDER_COMPLETED, ORDER_FAILED,
  ORDER_REFUNDED (docs/webhooks, guides/how-to-decrypt-webhook-payload).
- Order status list as in the table above (guides/track-order-status).
- Network code `base` exists and USDC on Base is listed (uniqueId
  `USDCbase`); on staging, network `base` reports chainId 84532 (Base
  Sepolia), so staging and production share the code and the implementation
  maps 8453 and 84532 to `base` (reference/get-crypto-currencies).

Modeled from the documented model, NEEDS VERIFICATION with a real partner
account:

- Production hosts `https://global.transak.com` and
  `https://api.transak.com`: the fetched pages only show the staging URLs
  explicitly; production follows Transak's documented naming convention.
- Direct query-parameter widget launch: Transak's newer docs describe a
  server-side Create Widget URL API
  (`POST https://api-gateway.transak.com/api/v2/auth/session`, returns a
  single-use 5-minute `widgetUrl` with a sessionId) as mandatory for
  "secure widget launches" (reference/create-widget-url). The classic direct
  query-param launch implemented here is still fully documented on the query
  parameters page, but whether Transak enforces the session API for new
  partner accounts must be checked during staging tests. If enforced, the
  change is contained to `createSession` (call the session API with the same
  widgetParams; it additionally needs the end user's IP and a
  `referrerDomain`, plus partner IP allowlisting).
- `defaultCryptoAmount` as a pre-fill parameter: part of Transak's classic
  widget model; not on the query-parameter page fetched. Harmless if
  ignored (the buyer picks an amount in-widget).
- `filter[status]` on the orders list documents a default of COMPLETED. If
  that default really filters the poll, non-terminal orders would be
  invisible to `getSessionStatus` (it then conservatively reports
  `created`); webhooks remain the primary status channel either way. Check
  during staging tests.
- Webhook event id ORDER_CANCELLED: the fetched webhook page lists
  ORDER_REFUNDED but not a cancelled event id. The mapping keys on
  `webhookData.status` (CANCELLED verified) first, and falls back to the
  event id, so this gap is cosmetic.

### 5.4 Activation checklist for Med

1. Create a Transak partner account (KYB required for production) at the
   Transak partner dashboard and obtain the staging API key and secret.
2. Set `TRANSAK_API_KEY` and `TRANSAK_API_SECRET` (leave
   `TRANSAK_ENVIRONMENT` unset for STAGING). `ONRAMP_PROVIDER` already
   defaults to transak.
3. In the Transak partner dashboard, register the webhook endpoint
   `https://<host>/api/onramp/webhook` for order events.
4. Run a staging purchase end to end: create an order, follow the widget
   redirect, pay with Transak staging test cards, and confirm the session
   reaches `completed` via webhook and the order transitions to `funded`.
   While doing so, verify the four NEEDS VERIFICATION items in 5.3 (direct
   widget launch accepted, production hosts, defaultCryptoAmount honored,
   orders poll visibility of non-terminal statuses).
5. Confirm EUR alongside USD in the widget for a UAE-based tester (the
   decision allows either; AED not required).
6. Amount caveat: the widget pre-fills but does not lock the purchase
   amount, and settlement credits the order's own `token_amount` when the
   session completes (`src/lib/onramp/settlement.ts`). Decide before
   production whether to lock amounts (`fiatAmount` locks the fiat side) or
   reconcile the delivered `cryptoAmount` from the webhook payload against
   the order total.
7. For production: request production API keys after KYB, set
   `TRANSAK_ENVIRONMENT=PRODUCTION`, re-register the production webhook, and
   repeat step 4 with a small real purchase.

## 6. API summary (WS4 consumers)

All bodies follow `{ ok: true, data } | { ok: false, error: { code, message } }`.

- `POST /api/onramp/create` body `{ orderId, fiatCurrency? }`. Errors:
  `unauthenticated`, `invalid_input`, `not_found`, `forbidden`, `conflict`
  (order not in created), `provider_error`, `internal`.
- `GET /api/onramp/status?sessionId=<providerSessionId>` returns
  `{ sessionId, onrampSessionId, status, provider, orderId, orderStatus,
  failureReason }`. Poll every few seconds while status is created or
  pending; stop on completed, failed or canceled.
- `POST /api/onramp/webhook` is provider-facing only (signature
  authenticated); the browser never calls it.
