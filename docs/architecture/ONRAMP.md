# Fiat on-ramp: provider research, decision and architecture

Research date: 2026-09-03. All links were checked on that date with automated
fetches; where a page could not be fetched directly this document says so
instead of guessing. Companion docs: docs/architecture/IMPLEMENTATION_PLAN.md
(WS3 scope, order state machine) and docs/PRODUCT_KNOWLEDGE.md section (c)
(the recorded operative choice: thirdweb primary, Stripe plus onramp
fallback).

## 1. Decision

thirdweb Bridge.Onramp is the primary fiat on-ramp provider, behind a
provider-agnostic `OnrampProvider` interface (`src/lib/onramp/types.ts`).
Transak is the recorded fallback, stubbed behind the same interface
(`src/lib/onramp/transak.ts`) so a swap changes zero route, repository or UI
code. A deterministic mock provider (`src/lib/onramp/mock.ts`) is wired when
`TEST_MODE=1`.

Reasons for thirdweb primary:

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
mock, otherwise thirdweb.

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

Handoff: `THIRDWEB_WEBHOOK_SECRET` and `THIRDWEB_ONRAMP_PROVIDER` should be
added to `src/lib/env.ts` (`ServerEnvName`) and `.env.example` by the
workstream that owns those files.

## 5. Transak fallback plan

Behind the same `OnrampProvider` interface; activating it means implementing
`src/lib/onramp/transak.ts` (currently a clearly marked not-implemented stub
whose `createSession` throws `provider_error`) and switching the provider
returned by `getOnrampProvider()` (an `ONRAMP_PROVIDER` env switch is the
natural extension). No route, repository, schema or UI changes.

Planned mapping (detailed in the stub's header comment):

- `createSession`: hosted widget URL with `apiKey`, `walletAddress`,
  `cryptoCurrencyCode=USDC`, `network`, `fiatCurrency` (AED),
  `partnerOrderId=orders.id`.
- `getSessionStatus`: partner orders API.
- `parseWebhook`: verified ORDER_* events; ORDER_PAYMENT_VERIFYING ->
  pending, ORDER_COMPLETED -> completed, ORDER_FAILED -> failed,
  ORDER_CANCELLED -> canceled.
- Env vars needed: `TRANSAK_API_KEY`, `TRANSAK_API_SECRET`,
  `TRANSAK_ENVIRONMENT`, `TRANSAK_WEBHOOK_SECRET`.

Prerequisites before activation: a Transak partner account (KYB), browser
verification of current UAE/AED terms (their site blocks automated fetches,
section 2.2), and a decision on whether Transak runs alongside thirdweb
(per-user geo routing) or replaces it.

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
