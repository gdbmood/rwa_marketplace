# Implementation plan: Supabase migration, indexer, on-ramp

This document fixes the module boundaries, data flows and contracts for the
implementation phase, so parallel workstreams do not collide. It complements
docs/PRODUCT_KNOWLEDGE.md (what to build) and docs/CODE_AUDIT.md (what exists).

## Layering

```
Browser (React, thirdweb v5 wallet)
  reads:  supabase-js anon client (RLS enforced) and server components
  writes: NEVER directly. Server actions only.
  chain:  signs transactions with the user's smart account (AA)

Next.js server (service role)
  src/lib/auth      verify thirdweb session JWT, mint RLS JWT
  src/lib/db        the ONLY database writer (repositories)
  src/actions       thin, authenticated wrappers over src/lib/db
  src/app/api       webhooks (sumsub, chain, onramp) and token endpoints

Indexer (authoritative for chain state)
  scripts/indexer.ts + src/lib/indexer + /api/chain-webhook + /api/indexer/run
```

## Source of truth rules

The chain is authoritative for: fraction balances (ERC20), primary listing
state (fetchAllListings), mint events, buy events. The indexer reconciles the
database to it. The database is authoritative for: users, KYC, drafts,
categories, orders, onramp sessions, and the resale order book (the deployed
contract emits no events for sellFractions, unlistFractions or updateListing
and exposes no resale getter, see docs/audit/contracts.md section 4). Server
actions that record resale operations verify the transaction receipt
(existence, success, target contract) before writing. A contract upgrade that
adds listing events plus a resale getter is the recorded recommended next step.

## Order state machine

created -> awaiting_funds (onramp only) -> funded -> submitted -> settled
created -> submitted (direct USDC path) -> settled
any non terminal -> failed (with failure_reason) or expired (sweeper)

Buy flow (USDC): createBuyOrder quotes fills from active listings cheapest
first, computes platform fee, inserts orders row. Client runs approve plus
buyFractions with its smart account. Client posts the tx hash via
submitOrderTx (status submitted). The indexer settles: on FractionBought plus
the ERC20 Transfer logs in that tx it decrements listing quantities, updates
both parties holdings, marks the order settled, writes transactions rows.
A reverted or abandoned tx leads to failOrder from the client error handler,
and an expiry sweeper expires stale orders. Two buyers racing for the last
fractions: the chain reverts one, so exactly one order settles and the other
fails with a clear message.

Buy flow (onramp): same order row, status awaiting_funds while the provider
session is open. Provider completion (webhook or poll) moves it to funded,
the client then executes the purchase, and the path merges with the USDC flow.

Mint flow: createDraftAsset (status draft, visible as Coming soon), business
clicks Mint and list, client sends mintAndFractionalizeNFT, action
setAssetMinting stores mint_tx_hash (status minting), indexer matches
NFTFractionalized by transaction hash, fills nft_id, erc20_token_address,
total_supply, promotes to active and creates the primary listing row.

Transfer flow: plain ERC20 transfer signed by the user. The indexer observes
Transfer logs on known fraction tokens and moves holdings between known
wallets without trusting the client at all.

## Workstream ownership (no file overlaps)

WS1 server actions and API security
  owns: src/actions/**, src/app/api/create-verification-session/**,
        src/app/api/sumsub-webhook/**, src/app/api/rls-token/** (new),
        src/lib/sumsub/** (new)
  work: rewrite every action on the repository layer with requireUser();
        actions for drafts CRUD, mint and list, listing ops (record secondary
        listing, update price, unlist), order create, submit, fail, transfer
        record, profile, settings, currency rate (API key to env);
        Sumsub webhook HMAC verification; KYC session route with verified JWT;
        hardened session cookie in login; RLS token endpoint.

WS2 indexer and scripts
  owns: scripts/indexer.ts, scripts/reconcile-chain.ts, scripts/seed.ts,
        src/lib/indexer/**, src/app/api/chain-webhook/**,
        src/app/api/indexer/run/** (cron entry), vercel.json
  work: event ingestion (NFTFractionalized, FractionBought, RoyaltyDistributed,
        ERC20 Transfer per known fraction token), fetchAllListings polling for
        primary listing truth, processing rules, idempotency on
        (chain_id, tx_hash, log_index), order settlement, holdings updates,
        reconcile script (holdings vs balanceOf, listings vs fetchAllListings),
        deterministic seed script for e2e.

WS3 on-ramp
  owns: src/lib/onramp/**, src/app/api/onramp/**
  work: OnrampProvider interface (createSession, getStatus, webhook parsing),
        thirdweb Bridge.Onramp implementation, mock provider for tests,
        session persistence via repositories, status polling endpoint,
        UAE and AED support research documented in docs/architecture/ONRAMP.md,
        Transak fallback stub behind the same interface.

WS4 frontend
  owns: src/app/** except src/app/api/**, src/components/**, src/store/**,
        src/hooks/**, src/lib/thirdWebClient.ts, src/lib/wallet/** (new)
  work: replace every browser Firestore read and write with server actions and
        anon supabase reads (v_marketplace, v_portfolio); drafts flow UI and
        Coming soon cards; buy page order flow with USDC, swap and card tabs,
        order status and failure states with retry; business dashboard sales
        view; loading, empty and error states on every screen; KYC gate UI;
        transfer UI; settings; currency display; works inside the existing MUI
        theme (src/theme.ts), no restyling of working screens, landing page
        untouched.

Integration (after workstreams land): remove firebase packages and
src/lib/firebaseClient.ts, src/lib/firebaseServer.ts, delete replaced
hand written types, fix cross boundary type errors, get build green.

## Action result contract (WS1 provides, WS4 consumes)

Every server action returns
`{ ok: true, data: T } | { ok: false, error: { code: string, message: string } }`
with codes: unauthenticated, forbidden, not_found, invalid_input, conflict,
kyc_required, chain_error, provider_error, internal. WS4 renders messages per
code and never throws on action results.

## Test mode (no external credentials in CI or e2e)

TEST_MODE=1 (server) and NEXT_PUBLIC_TEST_MODE=1 (client) enable:
  * a test login route that accepts a dev wallet private key and issues the
    same session cookie as production login (guarded, returns 404 unless
    TEST_MODE=1, refuses to run when NODE_ENV is production on Vercel)
  * a local EOA account used instead of the thirdweb in app wallet so
    Playwright can sign transactions against a local hardhat node
    (chain id 31337, contracts deployed by scripts/e2e/deploy-local.ts)
  * the mock onramp provider which succeeds or fails on demand
Production behaviour is unchanged when the flags are absent.
