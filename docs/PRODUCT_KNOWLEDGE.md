# Fractionaire (Fractionnaire) RWA Marketplace, Product Knowledge

Compiled 2026-09-03 from the DesertTech Notion teamspace (9 pages read in full plus 5 targeted workspace searches). This document is the migration reference for the codebase at `rwa_marketplace`. Where Notion pages disagree, the conflict is stated explicitly. Naming note: early specs spell the product "Fractionaire", the 2026 contracts spell it "Fractionnaire", and the deployed app and test report use "Desert Tech RWA Marketplace". All three refer to the same product line.

## 1. Product summary

Fractionaire is a decentralized marketplace for the fractionalization of real-world assets (RWAs). The branding decision is to use the word "fractionalization" rather than "tokenization". Businesses list physical or financial assets (real estate, luxury vehicles, yachts, diamonds, watches, commodities, bonds, invoices), which are minted on-chain, fractionalized into fungible fraction tokens, and sold to retail investors. Retail investors browse a marketplace with category pages, buy fractions settled in USDC, hold them in a portfolio, and resell them on a closed-ecosystem secondary market where resales carry a royalty.

The platform runs on the Base network (Coinbase Ethereum L2, chosen in a dedicated rationale report by Mood Global Services B.V., 19/02/2025). Users onboard through Thirdweb embedded wallets (email and social login) or their own wallets, and transact gaslessly through Thirdweb smart wallets with account abstraction, paying fees in USDC rather than holding ETH. Compliance uses Sumsub: KYB is triggered only when a business lists an asset, and retail investors face no KYC at sign-up (KYC applies per asset where required). The web frontend is Next.js with TypeScript and MUI, hosted on Vercel (production deployment at desert-tech-rwa-marketplace.vercel.app). The backend as delivered pairs Supabase (Postgres, application data, APIs, indexing) with Firebase (auth, media storage, real-time data), with Chainlink oracles for pricing, Alchemy RPC for node access, GCP for background jobs, and Resend for transactional email.

As of the July 2026 maintenance agreement the platform is described as LIVE, under a USD 1,500/month maintenance contract with Mood Global Services B.V., with a React Native mobile app contracted for delivery in August 2026. The product's stated competitive edge is fractional access to premium physical assets, a gasless account-abstraction experience, and direct USDC settlement on Base, expanding "from the UAE to global markets".

## 2. Roles

- **Retail Investor.** Browses the marketplace, buys and resells fractions, holds a portfolio, uses a watchlist. No KYC at sign-up. Must pass KYC before buying assets that require it. Source: [RWA Marketplace UX/UI Flow - Updated](https://app.notion.com/p/19de93a61c5d80608122d0b3311a2810).
- **Business User (issuer).** Lists assets via the "List New Asset" form, uploads ownership proof and compliance documents, mints and lists via "Mint & List", monitors fundraising through a business dashboard, can edit or remove listings. KYB (Sumsub) is triggered only at listing time, not at sign-up. Has access to a demo/sandbox mode to test minting before going live. Source: [RWA Marketplace UX/UI Flow - Updated](https://app.notion.com/p/19de93a61c5d80608122d0b3311a2810).
- **Dual-account user.** The same person can hold both a Business and a Retail account. Source: same page.
- **Admin / contract owner.** At contract level only the owner can update the platform fee, withdraw ERC20 tokens, and pause state-changing functions (all tested and passing). No admin web panel is documented for this product. Source: Performance & Test Report, Desert Tech RWA Marketplace (Notion URL not captured in the review notes).
- **Platform operator (Mood Global Services B.V.).** Runs maintenance, monitoring, SLA support, monthly security reviews, and the fee-receiver / gas-treasury operations. Source: Fractionnaire Maintenance, Support and Continuous Updates Agreement (Notion URL not captured in the review notes).

## 3. Capability inventory

Pages without a captured URL are cited by title. Key source pages with URLs: [UX/UI Flow - Updated](https://app.notion.com/p/19de93a61c5d80608122d0b3311a2810), [UX/UI Flow (original)](https://app.notion.com/p/194e93a61c5d8083b8e5cdb2f8f832a2), [Upgradable Smart Contracts](https://app.notion.com/p/243e93a61c5d8090a696ed93258c0dd1), [Hank first Task: RWA Marketplace Fork - Real Estate](https://app.notion.com/p/27ee93a61c5d80e489f6eab9fec88316).

| Feature | Role | Notion status | Source link |
|---|---|---|---|
| Landing page (hero, live stats, purpose, dApp screenshots, partners, blog, footer) | Public | Specified | [UX/UI Flow - Updated](https://app.notion.com/p/19de93a61c5d80608122d0b3311a2810) |
| Split CTAs: "Start Investing Now" (retail) and "List Your Assets Now" (business) replacing "Get Started" | Public | Specified | [UX/UI Flow - Updated](https://app.notion.com/p/19de93a61c5d80608122d0b3311a2810) |
| Onboarding modal, Business vs Retail selection, dual accounts allowed | All users | Specified | [UX/UI Flow - Updated](https://app.notion.com/p/19de93a61c5d80608122d0b3311a2810) |
| Sign-in: WalletConnect, email/password, Google, Apple, Facebook; Thirdweb embedded wallet auto-created for email logins | All users | Specified | [UX/UI Flow - Updated](https://app.notion.com/p/19de93a61c5d80608122d0b3311a2810) |
| Sumsub KYB/KYC as modal overlay (KYB at listing time, no retail KYC at sign-up) | Business, Retail | Specified | [UX/UI Flow - Updated](https://app.notion.com/p/19de93a61c5d80608122d0b3311a2810) |
| List New Asset form (title, category, valuation, compliance check, docs, images, cost, fraction count, price per fraction, eligibility, fees) | Business | Specified | [UX/UI Flow - Updated](https://app.notion.com/p/19de93a61c5d80608122d0b3311a2810) |
| Mint & List (T-REX contract per spec); minted assets auto-listed | Business | Specified; minting implemented and tested in the live contract | [UX/UI Flow](https://app.notion.com/p/194e93a61c5d8083b8e5cdb2f8f832a2); Performance & Test Report |
| Business dashboard (assets listed / sold / pending approval, fundraising stats, performance, investor participation, edit/remove) | Business | Specified | [UX/UI Flow - Updated](https://app.notion.com/p/19de93a61c5d80608122d0b3311a2810) |
| Demo account / Sandbox mode for issuers | Business | Open question (placement unconfirmed) | [UX/UI Flow - Updated](https://app.notion.com/p/19de93a61c5d80608122d0b3311a2810) |
| ROI display and early-bird discounts (first X fractions 10%, next Y 5%) | Business | Specified, X and Y never defined | [UX/UI Flow - Updated](https://app.notion.com/p/19de93a61c5d80608122d0b3311a2810) |
| Asset classifications: non-legally binding, legally binding (on-chain contract signature), revenue-generating (orthogonal attributes) | Business, Retail | Specified | [UX/UI Flow - Updated](https://app.notion.com/p/19de93a61c5d80608122d0b3311a2810) |
| On-chain legally binding contract signing before purchase; voided on resale, re-signed by new buyer | Retail, Business | Specified | [UX/UI Flow - Updated](https://app.notion.com/p/19de93a61c5d80608122d0b3311a2810) |
| Automatic on-chain revenue distribution by fraction ownership | Platform, holders | Specified | [UX/UI Flow - Updated](https://app.notion.com/p/19de93a61c5d80608122d0b3311a2810) |
| NFT fractionalization architecture: NFT locked in vault, ERC-20 fractions minted, royalty splitting, buyout mechanism (pay full valuation, burn fractions), multi-asset vaults | Platform | Specified | DevFlow UI/UX WIP (URL not captured) |
| Marketplace browse: categories, latest listings, advanced filters, most traded, watchlist, sorting by price / availability / past performance | Retail | Specified; category pages (Luxury Yachts, Diamonds, Luxury Cars) live in production | [UX/UI Flow - Updated](https://app.notion.com/p/19de93a61c5d80608122d0b3311a2810); Performance & Test Report |
| Asset cards: pricing, ownership history, progress bars for available vs owned fractions | Retail | Specified | [UX/UI Flow - Updated](https://app.notion.com/p/19de93a61c5d80608122d0b3311a2810) |
| Asset detail page: images, metadata, fraction ownership graph, price history, transaction history, issuer details | Retail | Specified; `/asset/{id}` pages deployed | [UX/UI Flow - Updated](https://app.notion.com/p/19de93a61c5d80608122d0b3311a2810); Performance & Test Report |
| Order book, limit-order style buy orders, counter-offers | Retail | Conflict: specified in the Feb 2025 flow, then marked TO REMOVE in DevFlow (May 2025) | [UX/UI Flow - Updated](https://app.notion.com/p/19de93a61c5d80608122d0b3311a2810); DevFlow UI/UX WIP |
| Buy fractions paid in USDC, wallet-to-wallet settlement, automatic conversion, irreversible on-chain | Retail | Implemented and tested (13/13 contract tests pass) | Performance & Test Report |
| Resale with royalty on secondary sales | Retail | Implemented and tested (full lifecycle mint, buy, resale, buy) | Performance & Test Report |
| Relisting and price updates by owner, unlisting, non-owners blocked | Asset owner | Implemented and tested | Performance & Test Report |
| Supply cap enforcement (cannot buy beyond listed supply); mint rejects zero price or zero supply | Platform | Implemented and tested | Performance & Test Report |
| Contract admin controls: owner-only platform fee update, ERC20 withdrawal, pause | Admin | Implemented and tested | Performance & Test Report |
| Platform fees to a receiver wallet via a fee collector function, minting fee upfront, trading fees on purchase, fees shown at each step | Platform | Specified; owner-adjustable fee implemented | [UX/UI Flow - Updated](https://app.notion.com/p/19de93a61c5d80608122d0b3311a2810); Performance & Test Report |
| Gasless USDC-only transactions (Thirdweb Smart Wallet AA, custom paymaster, USDC fee split to FeeCollector escrow, treasury rebalancing via Uniswap/1inch, Chainlink pricing) | All users | Spec deliverables all unchecked (Apr 2025); gasless AA described as live in the July 2026 maintenance agreement | Gasless Transactions via USDC page (URL not captured); Maintenance Agreement |
| Upgradeable Marketplace contract (ProxyAdmin + Proxy + Implementation, delegatecall) | Platform | Documented architecture decision | [Upgradable Smart Contracts](https://app.notion.com/p/243e93a61c5d8090a696ed93258c0dd1) |
| Chainlink price feeds for asset valuation | Platform | Live, verified monthly under maintenance | Maintenance Agreement |
| User profile pages keyed by wallet address (`/profile/0x...`) | Retail | Deployed in production | Performance & Test Report |
| Investor dashboard / portfolio | Retail | Live | Maintenance Agreement |
| Multi-currency display logic (currencyStore, formatNumberForDisplay, calculatePurchasePrice) | Retail | Implemented and tested (72/72 frontend tests pass) | Performance & Test Report |
| Transaction notifications (email, SMS, in-app) | All users | Planned ("will be implemented"); Resend email live per maintenance agreement | [UX/UI Flow - Updated](https://app.notion.com/p/19de93a61c5d80608122d0b3311a2810); Maintenance Agreement |
| Secondary market strategy: closed ecosystem first, DeFi (Uniswap, LPs) later | Platform | Phased strategy, DeFi deferred | [UX/UI Flow - Updated](https://app.notion.com/p/19de93a61c5d80608122d0b3311a2810) |
| Fiat card payments (thirdweb Checkout/Pay primary, Stripe + onramp fallback) | Retail | Specified in the real-estate fork spec, Day 5 of sprint plan; no formal provider decision recorded | [Hank first Task](https://app.notion.com/p/27ee93a61c5d80e489f6eab9fec88316) |
| Mobile app, iOS + Android (React Native + Expo, investor flows only, reuses production backend and contracts) | Retail | Contracted, milestones 1 Aug to 31 Aug 2026 | Fractionnaire Mobile Application Development Agreement (URL not captured) |
| Backend/database flow chart | Platform | Exists as an external embed titled "RWA Marketplace", unreadable via the Notion API | [Flow Chart](https://app.notion.com/p/1a4e93a61c5d80c7936ee3a6190ab34f) |

## 4. Core journeys

### 4.1 Business listing journey

1. On the landing page, click "List Your Assets Now" (replaces "Get Started").
2. In the onboarding modal, select Business User; sign in via WalletConnect, email/password, or social login (a Thirdweb embedded wallet is generated for email logins). No KYB at this point.
3. Click "List New Asset" and fill the form: title, category (Luxury Watches, Real Estate, Cars, Bonds, etc.), valuation, compliance check.
4. Upload ownership proof, legal compliance documents, and images; set asset cost, fraction count, price per fraction, investor eligibility (anonymous vs verified), and the fee structure; optionally set expected ROI and early-bird discount tiers.
5. KYB verification via Sumsub is triggered at this listing step, shown as a modal overlay.
6. Click "Mint & List". The asset is tokenized (T-REX contract per spec), the minting fee is paid upfront, and per the spec "Once minted, the asset is automatically listed in the marketplace" ([UX/UI Flow](https://app.notion.com/p/194e93a61c5d8083b8e5cdb2f8f832a2)).
7. Monitor the asset on the business dashboard (fundraising stats, performance, investor participation) and update or remove the listing. The dashboard also shows a "pending approval" status whose workflow is undocumented (see section 7d).
8. Optionally, use the demo/sandbox mode first to test minting and listing without going live.

### 4.2 Investor purchase journey

1. Click "Start Investing Now"; select Retail Investor in the modal; sign in via wallet, email, or social login. No KYC at sign-up.
2. Browse the marketplace: categories, latest listings, advanced filters, most traded, watchlist; sort by price, availability, past performance.
3. Open an asset detail page: images, metadata, price history, fraction ownership graph (available vs sold), transaction history, issuer details, Chainlink-driven valuation.
4. Start the buy flow: select the asset, enter fraction amount, choose payment (USDC or other crypto; fiat card via thirdweb Checkout/Pay is specified in the fork spec).
5. Gates before payment: if the asset requires KYC, pass Sumsub KYC first; if the asset is legally binding, sign the on-chain contract first.
6. Confirm. Funds move directly from buyer wallet to seller wallet in the seller's selected currency with automatic conversion; gas is covered from the USDC amount itself via the AA paymaster flow (no ETH needed). The transaction is irreversible once on-chain.
7. Both parties receive a notification (email, SMS, or in-app); the position appears in the investor's portfolio.

### 4.3 Resale (secondary market) journey

1. The holder opens their portfolio and lists fractions for sale, setting a price. The secondary market is a closed ecosystem: trading happens only on the platform until liquidity justifies DeFi expansion.
2. A buyer finds the resale listing. If the asset requires KYC, the new buyer must pass KYC before purchasing.
3. If the asset is legally binding, the existing on-chain contract is voided on resale and the new buyer must sign a new one; KYC-compliant ownership transfer completes before asset control changes hands.
4. The purchase settles in USDC wallet-to-wallet; a royalty is paid on the resale (implemented and tested in the live contract) and platform trading fees go to the receiver wallet.
5. Note: the original spec described buy orders behaving like limit orders in an order book with counter-offers, but DevFlow later marked limit orders "TO REMOVE". Treat direct fixed-price resale as the operative model.

### 4.4 KYC / KYB journey

1. Retail sign-up: no KYC. Business sign-up: no KYB.
2. Business KYB: triggered only when the business lists its first asset, via Sumsub in a modal overlay.
3. Retail KYC: triggered per asset. Non-legally-binding assets can be bought anonymously with no KYC. Assets flagged as requiring verified investors trigger Sumsub KYC before purchase.
4. Legally binding assets additionally require an on-chain contract signature before purchase; the contract is stored on-chain for inspection.
5. On secondary purchases of KYC-required assets, the new buyer re-passes KYC, and for legally binding assets re-signs a fresh contract (the prior one is voided).
6. Compliance integrations are meant to be dynamically updated for regulatory changes; Chainalysis is cited for KYC/AML in DevFlow.

## 5. Explicit out-of-scope

- **Limit orders / order book.** Specified in Feb 2025, then explicitly highlighted and marked "TO REMOVE" in DevFlow (May 2025).
- **Open/DeFi secondary market at launch.** Uniswap listings and liquidity pools are deferred until the closed ecosystem reaches sufficient liquidity (threshold undefined).
- **Final copywriting.** Explicitly one of the last tasks in development.
- **Gasless add-ons.** Admin dashboard for gas vs USDC monitoring, multi-token support (DAI, USDT), referral integration, and daily paymaster caps are all flagged "to be discussed in the future".
- **Mobile app exclusions.** The mobile scope contains no seller/business tooling, no listing creation, no admin features, and no fiat on-ramp; it must not rebuild or modify the backend or contracts.
- **Maintenance scope exclusions.** Major/new feature development beyond bug fixing, minor features, and interface refinements; third-party provider failures; client legal disputes.
- **Load-test scope.** Only read-only GET endpoints were load-tested; no purchase/mint write-path load testing.
- **Atex/AVA Capital concepts.** Draft/Verifying/Verified/Public statuses, "Coming Soon" listings, Anchor investor phases, and the admin Asset Verification Queue belong to the separate Atex Capital project, not to this product's documented scope.

## 6. Technical decisions recorded in Notion

- **Chain.** Base (Coinbase Ethereum L2, Optimism OP Stack). Chosen over Polygon zkEVM, Arbitrum One, Arbitrum Nova, and Optimism in the Extended Report by Mood Global Services B.V. (19/02/2025) for sub-$0.01 fees, sub-second finality, Ethereum-inherited security, grants, and Superchain interoperability. The maintenance agreement states "The Platform is live on the Base network". See section 7b for the mainnet vs Sepolia caveat.
- **Wallets.** Thirdweb: embedded (in-app) wallets for email/social login (a wallet is generated for email users), plus support for existing wallets via MetaMask/WalletConnect.
- **Account abstraction and gas.** Thirdweb Smart Wallet (ERC-4337) with the Thirdweb Bundler. Users pay only USDC; gas is deducted from the spend amount (worked example: 0.15 of 10 USDC) into a FeeCollector escrow, a custom/self-hosted paymaster fronts gas from an ETH treasury, and a backend service rebalances by swapping USDC to ETH via Uniswap or 1inch with Chainlink USDC/ETH price feeds.
- **Contracts.** Solidity on Base. Spec-level: T-REX standard for Mint & List; ERC-721 NFT locked in a vault and fractionalized into ERC-20 fractions, with royalty splitting, buyout (burn fractions), and multi-asset vaults; OpenZeppelin modules and Fractional/Tessera as references. Architecture: the Marketplace contract is upgradeable via the ProxyAdmin + Proxy + Implementation pattern ([Upgradable Smart Contracts](https://app.notion.com/p/243e93a61c5d8090a696ed93258c0dd1)). The tested contract has platform fee, pause, ERC20 withdrawal (owner-only), supply caps, and resale royalties. The real-estate fork adds an on-chain KYCRegistry and a platform fee capped at 1000 bps.
- **Database and backend.** Conflict across time. DevFlow (May 2025) states Firebase is "the primary backend database"; the Fractionnaire Monthly Fee proposal (Aug 2025) also specifies Firebase/Firestore. The July 2026 maintenance and mobile agreements record the delivered stack as Supabase (Postgres) for application data, APIs, and indexing, with Firebase scoped to authentication, media storage, and real-time data. Treat Supabase + Firebase as current production. Supporting services: GCP (background jobs, scheduled tasks), Alchemy RPC (Base node access), Chainlink (price feeds), Resend (transactional email).
- **Frontend.** Next.js + TypeScript, MUI exclusively (no arbitrary HTML, global centralized theme, MUI Mantis Figma kit), hosted on Vercel (nexlabs team), GitHub issue-tied branches with squash merges, JWT (NextAuth.js or Thirdweb) in HttpOnly cookies, RBAC and RLS enforced, CORS restricted via middleware.
- **KYC/KYB.** Sumsub, rendered as a modal overlay; Chainalysis cited for AML.
- **Testing.** Hardhat for contracts (13/13 passing), Jest for frontend units (72/72 passing across 7 suites), K6 for load (147,689 requests, 0 failures, up to 500 concurrent VUs, p95 1.26 s against the Vercel production deployment). Detox is contracted for mobile end-to-end tests. Regular smart contract audits are called for in the spec; none are recorded as performed.

## 7. Answers to the five key questions

### (a) Was Supabase ever the intended database?

Not in the planning documents; it is the delivered database. DevFlow states "The platform utilizes Firebase as the primary backend database" and mentions Supabase only as one generic option in security examples. The Fractionnaire Monthly Fee proposal (13/08/2025) specifies Firebase, Firestore, and Firebase Cloud Functions. But the 2026 maintenance agreement says the platform "runs on a Next.js frontend with a Supabase and Firebase backend" and its stack table assigns Supabase (Postgres) to application data, APIs, and indexing, and the mobile agreement reuses "the same Supabase and Firebase backend". The sibling Atex Capital release notes also confirm a delivered Supabase backend: "Database backend: schema for assets, companies, buybacks and trades; Supabase Storage buckets for asset photos and financial documents; row-level security throughout" ([Atex Capital RWA Marketplace](https://app.notion.com/p/31ae93a61c5d804fa133fb862999ba69)). **Assumption we proceed with:** Supabase (Postgres) is the system of record for application data, Firebase handles auth, media, and real-time; the Firebase-only wording in 2025 docs is superseded.

### (b) Which chain is production?

Base, with an unresolved mainnet-vs-testnet caveat. The maintenance agreement states "The Platform is live on the Base network" and lists Base as the settlement layer, with Alchemy RPC access and gas optimization on Base as maintenance duties. However, no Notion page records a Base mainnet deployment or mainnet contract addresses. The fork spec's env template reads `CHAIN_ID=8453 # Base Mainnet (or 84532 for Base Sepolia)` while its actual sprint deliverable was "shipping MVP on Base Sepolia" ([Hank first Task](https://app.notion.com/p/27ee93a61c5d80e489f6eab9fec88316)). Precedent: the Atex Capital release is labeled LIVE while running on Ethereum Sepolia, so "live" in this workspace does not prove mainnet. **Assumption we proceed with:** Base is the production chain family, with Base mainnet (8453) as the intended production network and Base Sepolia (84532) as the QA/testnet target; the actually deployed chain id must be verified in the codebase env/config before migration.

### (c) Which on-ramp provider, if any, was chosen?

No formal decision exists. The dedicated page "Fiat On Ramp Provider, Final Decision for MVP" ([link](https://app.notion.com/p/f74aefa7915f4184aa06e755e1a9e056)) is blank, status On hold, last edited 2023. The operative choice is in the fork spec: "use thirdweb Checkout/Pay for embedded card -> auto onramp to USDC and call purchase, or Stripe + onramp fallback (server creates Checkout Session -> webhooks -> mint on confirm)", with thirdweb Checkout labeled Option A "(fastest)" and scheduled on Day 5 of the sprint. DevFlow also attributes card payments to Thirdweb's integrated gateways. Transak and MoonPay are never named for this project. **Assumption we proceed with:** thirdweb Checkout/Pay is the primary fiat on-ramp, Stripe plus onramp is the fallback, and for fiat flows the server executes the on-chain purchase to guarantee atomicity.

### (d) Do listings need admin approval?

Conflicting evidence, project-generation dependent. The Fractionaire spec says listing is automatic: "Once minted, the asset is listed in the marketplace for fractional ownership", with Sumsub KYB as the only gate on the issuer ([UX/UI Flow - Updated](https://app.notion.com/p/19de93a61c5d80608122d0b3311a2810)). Yet the same spec's Business Dashboard enumerates asset states "listed, sold, pending approval", implying an approval state with no documented workflow or approver. The related Atex Capital project does gate listings: assets pass an "AI / admin verification gate" before mint, currently a manual admin check, with an admin panel plus AI verification planned ([Atex Capital](https://app.notion.com/p/31ae93a61c5d804fa133fb862999ba69)); its design doc defers a human Asset Verification Queue to M2+ ([First Flow Draft](https://app.notion.com/p/322e93a61c5d805aa0dcfc2f5bb5d322)). For this codebase, the only implemented admin controls are contract-level (fee, pause, withdraw). **Assumption we proceed with:** for Fractionnaire, mint-then-auto-list with KYB as the issuer gate; support a "pending approval" listing status in the data model so a manual or AI verification gate (the Atex direction) can be added without schema change, but do not block minted assets today.

### (e) Are pre-mint draft listings wanted?

Notion is silent on any requirement for pre-mint draft listings in the Fractionaire product. Both UX/UI flow pages make listing a side effect of minting ("Once minted, the asset is automatically listed in the marketplace", [UX/UI Flow](https://app.notion.com/p/194e93a61c5d8083b8e5cdb2f8f832a2)); the closest concepts are the dashboard's "pending approval" status and the issuer demo/sandbox mode. Draft/Verifying/Verified/Public statuses and "Coming Soon" marketplace badges exist only in the separate Atex Capital design ([First Flow Draft](https://app.notion.com/p/322e93a61c5d805aa0dcfc2f5bb5d322)). **Assumption we proceed with:** superseded by the mission brief, which explicitly mandates draft listings: a business can save an asset as draft, it appears in the marketplace as a Coming soon card (not purchasable), and mint and list promotes it. Drafts were built accordingly; Notion remains silent on the topic.

## 8. Open questions and working assumptions

1. **Early-bird discount tiers.** X and Y ("first X fractions 10%, next Y 5%") were never defined. Assumption: make both configurable per listing by the issuer, no platform default.
2. **Platform fee model.** "Fixed or dynamic" was never decided; the tested contract has an owner-adjustable fee, the fork caps it at 1000 bps. Assumption: a single owner-adjustable fixed percentage fee, capped at 10%.
3. **Gas fee rate in the USDC split.** Only illustrated by example (0.15 of 10 USDC). Assumption: dynamic, computed from Chainlink USDC/ETH pricing plus a buffer, not a hardcoded 1.5%.
4. **Sandbox/demo placement.** Whether it lives in the profile section was left for client confirmation. Assumption: keep it accessible from the business profile, isolated from production data.
5. **Closed-to-DeFi transition.** "Sufficient liquidity" has no threshold. Assumption: closed ecosystem only; treat DeFi expansion as a separate future project requiring a new decision.
6. **Owner of "pending approval".** No approver or workflow is documented. Assumption: platform operator (MGS/admin) resolves it manually until an admin panel exists (see 7d).
7. **Order book / counter-offers.** Spec vs DevFlow conflict. Assumption: follow the later DevFlow instruction, no limit orders; fixed-price listings with direct purchase only, no counter-offer UI.
8. **Base mainnet promotion.** No page records a mainnet deployment (see 7b). Assumption: verify against the repo's env; do not claim mainnet in user-facing copy until contract addresses are confirmed.
9. **Push notification provider (mobile).** Resend covers email only. Assumption: Expo push notifications, as the natural default for the contracted React Native + Expo stack.
10. **"Currency logic" meaning (mobile M2).** Undefined whether it is fiat display conversion, USDC handling, or both. Assumption: port the web currencyStore behavior (multi-currency display with USDC settlement) unchanged.
11. **T-REX vs delivered contract.** The spec names T-REX; the tested contract and upgradable-proxy page describe a custom upgradeable Marketplace contract, and DevFlow describes a vault + ERC-20 model. Assumption: the delivered custom upgradeable Marketplace contract is authoritative; T-REX is legacy spec language.
12. **Smart contract audits.** Called for in the spec, none recorded. Assumption: not yet performed; flag as a pre-mainnet requirement.
13. **Governing spec generation.** The DesertTech/Fractionaire model (mint-then-auto-list) and the newer Atex/AVA model (draft, verification gate, coming soon) are related but distinct. Assumption: this repo follows the DesertTech/Fractionaire model, matching the working directory name and the maintenance agreement's description.
14. **Backend/database flow chart content.** The [Flow Chart](https://app.notion.com/p/1a4e93a61c5d80c7936ee3a6190ab34f) page under "BE and DB:" is an external embed unreadable via the API. Assumption: proceed without it; derive the backend flow from the maintenance agreement's architecture diagram and the codebase itself.
