# Smart Contracts Audit (legacy/rwa_marketplace_smartcontracts)

Audited repo: `/Users/gdbmood/Desktop/Fractionnaire/legacy/rwa_marketplace_smartcontracts` (Hardhat 2.23, Solidity 0.8.28, OpenZeppelin 5.3, optimizer enabled at 100 runs, evm target paris). Compared against the frontend ABI at `/Users/gdbmood/Desktop/Fractionnaire/rwa_marketplace/src/utils/ABI.ts`.

Verification performed: `npm ci` (757 packages), `npx hardhat compile` (36 files compiled successfully), `npx hardhat test` (14 passing, 0 failing). The hardhat config requires `PRIVATE_KEY` and `RPC_URL` env vars even to compile (`hardhat.config.ts:30-37`), a dummy 32-byte key was used. Node v25 prints an "unsupported by Hardhat" warning but nothing failed.

## 1. Contracts and purpose

### Marketplace.sol (the only contract the frontend talks to)

`contracts/Marketplace.sol:13-19`. Upgradeable NFT fractionalization marketplace. Inherits `Initializable`, `PausableUpgradeable`, `OwnableUpgradeable`, `ReentrancyGuardUpgradeable`, `ERC721HolderUpgradeable`.

- Mints an NFT to itself and deploys a fresh `ERC20Token` per asset, minting `totalSupply` fraction tokens directly to the creator (`Marketplace.sol:88-139`). The NFT stays custodied by the marketplace (`safeMint(address(this))`, line 96).
- Payment token is USDC (`IERC20 public USDC`, line 25), set in `initialize`.
- Order book per NFT: `resales[nftId]` is an array of `NFTResaleDetails {seller, amount, amountSold, pricePerFraction}` kept price-sorted with an on-chain recursive quicksort (`Marketplace.sol:152-175`).
- `buyFractions` (lines 238-357) walks the sorted resale list, pulls fraction tokens from each seller via `transferFrom` (sellers keep custody and only grant allowance, there is no escrow), pays each seller in USDC, then charges the buyer a platform fee in basis points on top (`platformFeeAmount = totalPrice * platformFee / 10000`, line 271) sent to `feeRecipient` (line 344).
- `sellFractions` (lines 359-395) appends a resale entry (requires balance and allowance at listing time only).
- `unlistFractions` (lines 397-419) removes the first entry matching `(msg.sender, pricePerFraction)`.
- `updateListing` (lines 177-203) lets the original `nftOwner` change the listing price and metadata, and rewrites the price of every resale entry where `seller == msg.sender`.
- `depositRevenue` (lines 421-460) is payable in ETH and splits `msg.value` across `holderList[nftId]` pro rata by current ERC20 balance over original `totalSupply`, any remainder goes to the contract owner.
- Admin: `pause`/`unpause` (80-86), `setPlatformFee` (462-464, no upper bound despite the README claiming a 10 percent max), `setFeeRecipient` (466-469), `withdrawETH` (471-477), `withdrawERC20` (479-491).
- Initial platform fee is 10 basis points, 0.1 percent (`Marketplace.sol:76`).

### BaseNFT.sol

`contracts/BaseNFT.sol:7-24`. Minimal ERC721 ("Fractionalized NFT", symbol "fNFT") with sequential ids, `safeMint(address to)` restricted to owner (the Marketplace), and `totalSupply()` returning `_nextTokenId`. Deployed by `Marketplace.initialize` (`Marketplace.sol:74`), not deployed standalone.

### ERC20Token.sol

`contracts/ERC20Token.sol:8-17`. ERC20 + ERC20Permit + Ownable with an owner-only `mint`. Used twice: as the per-NFT fraction token (deployed inside `mintAndFractionalizeNFT`, owner is the Marketplace) and, in tests, as a mock USDC.

## 2. Upgradeability

Yes. Marketplace is deployed behind an OpenZeppelin **transparent proxy** via `upgrades.deployProxy(..., { initializer: 'initialize' })` (`scripts/deploy_upgradeable_marketplace.ts:8`) and upgraded via `upgrades.upgradeProxy(process.env.DEPLOYED_MARKETPLACE_ADDRESS, Marketplace)` (`scripts/upgrade_marketplace.ts:5`). The `.openzeppelin/` manifests confirm `"kind": "transparent"` for all recorded proxies. `BaseNFT` and `ERC20Token` are plain, non-upgradeable contracts.

Storage layout history matters here: the two older Base Sepolia implementations (`0x6Dc226918B9460cea5758A07E01d5735B3eF4CEA`, `0xE5D7a37f07b780fD55989B296399f2478c8dD5ED`) have an `NFTDetails` struct with an extra `assetClass` enum field and no `feeRecipient` slot. The current source (and impls `0x651D1c4D4Ae3e9E7E4400875C1F8703e2d4db8D1` on Sepolia and `0xADC240E97970B1C0c9AB87F80E60AbC6af30D536` on mainnet) inserted `feeRecipient` at slot 1 and removed `assetClass`, which is an incompatible layout change, so the newer implementations cannot have been in-place upgrades of the older proxy, they correspond to fresh proxy deployments.

## 3. Full public interface (compiled ABI, current source)

From `artifacts/contracts/Marketplace.sol/Marketplace.json` after compile:

| Function | Mutability | Signature |
|---|---|---|
| `initialize` | nonpayable | `initialize(address _usdcAddress, address _feeRecipient)` |
| `mintAndFractionalizeNFT` | nonpayable | `(uint256 totalSupply, uint256 pricePerFraction, string metadata) returns (uint256)` |
| `fetchAllListings` | view | `() returns (NFTDetails[])`, tuple is `(address nftOwner, uint256 nftId, string metadata, uint256 totalSupply, uint256 pricePerFraction, address erc20TokenAddress, bool isFractionalized)` |
| `buyFractions` | nonpayable | `(uint256 nftId, uint256 amount)` |
| `sellFractions` | nonpayable | `(uint256 nftId, uint256 amount, uint256 pricePerFraction)` |
| `unlistFractions` | nonpayable | `(uint256 nftId, uint256 pricePerFraction)` |
| `updateListing` | nonpayable | `(uint256 nftId, uint256 pricePerFraction, string metadata)` |
| `depositRevenue` | payable | `(uint256 nftId)` |
| `platformFee` | view | `() returns (uint256)` |
| `USDC` | view | `() returns (address)` |
| `owner` | view | `() returns (address)` |
| `paused` | view | `() returns (bool)` |
| `pause` / `unpause` | nonpayable | owner only |
| `setPlatformFee` | nonpayable | `(uint256 newFee)`, owner only, no cap |
| `setFeeRecipient` | nonpayable | `(address newRecipient)`, owner only |
| `withdrawETH` | nonpayable | owner only |
| `withdrawERC20` | nonpayable | `(address tokenAddress, uint256 amount)`, owner only |
| `transferOwnership` / `renounceOwnership` | nonpayable | from OwnableUpgradeable |
| `onERC721Received` | nonpayable | from ERC721HolderUpgradeable |

Custom errors (OZ 5 style): `EnforcedPause`, `ExpectedPause`, `InvalidInitialization`, `NotInitializing`, `OwnableInvalidOwner(address)`, `OwnableUnauthorizedAccount(address)`, `ReentrancyGuardReentrantCall`. Business logic reverts use require strings (e.g. "Not enough fractions listed for sale", "Insufficient USDC allowance for transfer").

There are NO getters for `resales`, `holderList`, `feeRecipient`, or a single `nfts[id]` entry, `fetchAllListings` is the only read into listing state, and resale order book contents are not readable on-chain by the frontend at all.

## 4. Events (for the chain indexer)

Declared at `Marketplace.sol:47-63`:

| Event | Args | Emitted by |
|---|---|---|
| `NFTFractionalized` | `uint256 indexed nftId, address erc20TokenAddress, uint256 totalSupply, uint256 pricePerFraction` | `mintAndFractionalizeNFT` (line 131) |
| `FractionBought` | `address indexed buyer, address indexed erc20Token, uint256 amount, uint256 pricePaid` | `buyFractions` (line 351), `pricePaid` excludes the platform fee |
| `RoyaltyDistributed` | `address indexed erc20Token, uint256 amount, uint256 timestamp` | `depositRevenue` (line 455) |

Inherited (also in the ABI): `Initialized(uint64)`, `OwnershipTransferred(address indexed, address indexed)`, `Paused(address)`, `Unpaused(address)`.

Indexer caveats:

- `FractionBought` and `RoyaltyDistributed` carry the fraction token address, not the `nftId`. An indexer must build an `erc20Token -> nftId` map from `NFTFractionalized` first.
- `FractionBought` does not identify sellers, and there are NO events at all for `sellFractions`, `unlistFractions`, `updateListing`, `setPlatformFee`, or `setFeeRecipient`. Resale listings and price changes are invisible to an event-based indexer, the only complete source of listing state is polling `fetchAllListings` (which itself omits the resale order book).
- Per-fill detail inside a multi-seller `buyFractions` is not emitted, only the aggregate.

## 5. Frontend ABI comparison (src/utils/ABI.ts)

The 7 fragments in `/Users/gdbmood/Desktop/Fractionnaire/rwa_marketplace/src/utils/ABI.ts` were diffed field by field against the compiled ABI (inputs, outputs, names, internalTypes, stateMutability):

| Frontend fragment (const name) | Contract function | Result |
|---|---|---|
| `getNFTS` (ABI.ts:1-50) | `fetchAllListings` | EXACT MATCH |
| `createListing` (ABI.ts:52-80) | `mintAndFractionalizeNFT` | EXACT MATCH |
| `buyNFT` (ABI.ts:82-99) | `buyFractions` | EXACT MATCH |
| `sellNFT` (ABI.ts:101-123) | `sellFractions` | EXACT MATCH |
| `unlistNFT` (ABI.ts:125-142) | `unlistFractions` | EXACT MATCH |
| `updateListing` (ABI.ts:144-166) | `updateListing` | EXACT MATCH |
| `fetchPlatformFee` (ABI.ts:168-180) | `platformFee` | EXACT MATCH |

No drift in the fragments themselves against the CURRENT source. Gaps and risks:

1. The frontend ABI contains no events, so the frontend (or an indexer reusing this file) cannot decode `NFTFractionalized`, `FractionBought`, or `RoyaltyDistributed` from it.
2. `depositRevenue` is absent from the frontend ABI, revenue distribution is not reachable from the app.
3. All admin functions (`pause`, `setPlatformFee`, `setFeeRecipient`, `withdrawETH`, `withdrawERC20`) and reads (`USDC`, `owner`, `paused`) are absent, presumably intentional.
4. Version drift risk against the README-documented deployment: the frontend `fetchAllListings` tuple has 7 fields, but the two older Sepolia implementations return an 8-field tuple including `assetClass` (confirmed via `.openzeppelin/base-sepolia.json` struct layouts). If `NEXT_PUBLIC_THIRDWEB_CONTRACT_ADDRESS` points at the README's proxy `0x7FfF316219A036C084F0e84c251c5276e0A6f861` (documented before the fee-collector rewrite, see git history), decoding will be wrong. The frontend address comes from env (`src/lib/thirdWebClient.ts:10-14`), the checked-in `.env.example` is empty, so this cannot be confirmed offline, verify which proxy the production env points to.

## 6. Test results

`npx hardhat test`: **14 passing, 0 failing** (about 1s). Suites: `test/Marketplace.ts` (1: relist and update price flow), `test/edge-cases/Marketplace.fails.ts` (1: over-buy reverts), `test/integration/Marketplace.flow.ts` (1: mint, buy, resale, buy, depositRevenue), `test/unit/Marketplace.admin.ts` (3), `test/unit/Marketplace.buy.ts` (3), `test/unit/Marketplace.core.ts` (2), `test/unit/Marketplace.sell.ts` (3). Helper deploys the proxy with a mock ERC20Token as USDC (`test/helpers/utils.ts:4-19`). Coverage is happy-path heavy, nothing exercises multi-seller fill ordering, allowance revocation after listing, unlist with duplicate prices, fee cap, or the holderList bookkeeping.

## 7. Networks and deployed addresses

Networks in `hardhat.config.ts:26-38`: `hardhat` (allowUnlimitedContractSize), `baseSepolia` (url from `RPC_URL`, account from `PRIVATE_KEY`), `baseMainnet` (`https://mainnet.base.org`, account from `PRIVATE_KEY`). Etherscan verify key at lines 39-41. `.env.example` documents `RPC_URL=https://sepolia.base.org`, `PRIVATE_KEY`, `DEPLOYED_MARKETPLACE_ADDRESS`, `ETHERSCAN_API_KEY`.

Addresses found in the repo:

| Where | Network | Address | What |
|---|---|---|---|
| `README.md:47` | Base Sepolia | `0x7FfF316219A036C084F0e84c251c5276e0A6f861` | Marketplace proxy (transparent), documented deployment, PRE fee-collector layout per git history |
| `README.md:48`, `scripts/deploy_upgradeable_marketplace.ts:3` | Base Sepolia | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | USDC used at deploy |
| `.openzeppelin/base-sepolia.json` | Base Sepolia | `0x27De872d3E546Db2157e516C10d9C7bDBed03Aa3` | Second Marketplace proxy (transparent), newer |
| `.openzeppelin/base-sepolia.json` | Base Sepolia | `0x6Dc226918B9460cea5758A07E01d5735B3eF4CEA`, `0xE5D7a37f07b780fD55989B296399f2478c8dD5ED` | Old implementations (struct includes `assetClass`, no `feeRecipient`) |
| `.openzeppelin/base-sepolia.json` | Base Sepolia | `0x651D1c4D4Ae3e9E7E4400875C1F8703e2d4db8D1` | Implementation matching current source |
| `.openzeppelin/base.json` | Base mainnet | `0x511B10f9fD7d95738E372757EF85FB8a0c290f0E` | Marketplace proxy (transparent), MAINNET |
| `.openzeppelin/base.json` | Base mainnet | `0xADC240E97970B1C0c9AB87F80E60AbC6af30D536` | Mainnet implementation, layout matches current source |

Note: a Base **mainnet** proxy exists even though the README only mentions Sepolia. The deploy script as committed cannot run unmodified, `FEE_RECIPIENT_ADDRESS` is an empty string (`scripts/deploy_upgradeable_marketplace.ts:4`) which fails ABI encoding.

## 8. Notable contract-level risks (recorded for later phases)

- No escrow on resale listings: `buyFractions` depends on each seller's live balance and allowance (`Marketplace.sol:295-306`). A seller can list, then transfer or revoke, and every buy touching that entry reverts, blocking fills of deeper entries too.
- `holderList` only ever adds buyers (`updateHolderList`, lines 205-236), the original minter is never added, so in `depositRevenue` the creator's pro rata share of revenue is silently redirected to the platform owner via the remainder branch (lines 448-453). Holders who received tokens by direct ERC20 transfer are also invisible.
- `depositRevenue` loops external calls to every holder, one reverting receiver (a contract without receive) bricks distribution for that NFT.
- Recursive quicksort on storage runs inside `sellFractions`, `buyFractions`, `unlistFractions`, `updateListing`, gas grows quickly with order book depth, and `fetchAllListings` is an unbounded loop over all NFTs ever minted.
- `setPlatformFee` has no cap (line 462-464), the README's "max 1000" claim (README.md:128) is not enforced.
- `unlistFractions` removes only the FIRST entry matching seller and price, duplicate-price listings need repeated calls.
- Prices are raw USDC base units (6 decimals). The contract never scales by 10**6, the comment in `test/Marketplace.ts:32` ("Because in contract we do * 10**6") is wrong, and the frontend must treat `pricePerFraction` as micro-USDC.
- Metadata is an arbitrary string stored on-chain (tests store JSON blobs), there is no tokenURI wiring on `BaseNFT`.
