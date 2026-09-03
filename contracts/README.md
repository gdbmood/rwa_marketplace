# 🏪 Marketplace Smart Contract

A decentralized **NFT fractionalization and trading platform** built on Ethereum. This contract allows users to fractionalize NFTs into ERC20 tokens, buy/sell fractions, and distribute revenue among fraction holders.

## 🚀 Features

* Mint and fractionalize NFTs into custom ERC20 tokens.
* Buy and sell fractions using USDC.
* Distribute ETH revenue to all current fraction holders.
* Resale listings with dynamic price sorting.
* Owner-set platform fee for transactions.

## 🛠️ Installation

1. Clone the repo.
2. Install dependencies
```bash
npm install
```
3. Create a .env file in the root directory. You can copy from .env.example:
```bash
cp .env.example .env
```
4. Configure your .env file with your desired values (e.g., private key, RPC URL, etc.).

## 🧪 Build & Test

To compile the contracts:
```bash
npx hardhat compile
```
To run tests:
```bash
npx hardhat test
```

## 🏗️ Deployment

You can deploy the contract using Hardhat:
```bash
npx hardhat run scripts/deploy.js --network <your-network>
```

## 📍 Deployed Contract

* **Network**: Base Sepolia
* **Marketplace Contract**: `0x7FfF316219A036C084F0e84c251c5276e0A6f861`
* **USDC Address Used**: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

## 📄 Contract Overview

* **NFT Contract**: `BaseNFT`
* **Fraction Token**: `ERC20Token`
* **Payment Token**: `USDC (IERC20)`

## 🔧 Functions

### 📝 Write Functions (State-Changing)

#### `mintAndFractionalizeNFT(uint256 totalSupply, uint256 pricePerFraction, string metadata)`

* Mints a new NFT and fractionalizes it into an ERC20 token.
* **Params**:

  * `totalSupply`: Number of fractions.
  * `pricePerFraction`: Price per fraction.
  * `metadata`: String encoded metadata.
* **Returns**: `uint256` - The NFT ID.

---

#### `buyFractions(uint256 nftId, uint256 amount)`

* Buy fractions of an NFT using USDC.
* **Params**:

  * `nftId`: NFT identifier.
  * `amount`: Number of fractions to buy.

---

#### `sellFractions(uint256 nftId, uint256 amount, uint256 pricePerFraction)`

* List fractions for sale at a specific price.
* **Params**:

  * `nftId`: NFT identifier.
  * `amount`: Number of fractions to sell.
  * `pricePerFraction`: Price per fraction.

---

#### `unlistFractions(uint256 nftId, uint256 pricePerFraction)`

* Remove a specific resale listing.
* **Params**:

  * `nftId`: NFT identifier.
  * `pricePerFraction`: Price of the listing to unlist.

---

#### `updateListing(uint256 nftId, uint256 pricePerFraction, string metadata)`

* Update listing price and metadata.
* **Params**:

  * `nftId`: NFT identifier.
  * `pricePerFraction`: New price per fraction.
  * `metadata`: Updated metadata string.

---

#### `depositRevenue(uint256 nftId) payable`

* Deposit ETH revenue to be shared among holders.
* **Params**:

  * `nftId`: NFT identifier.

---

#### `setPlatformFee(uint256 newFee)`

* Set platform fee in basis points (e.g., `10 = 0.1%`).
* **Params**:

  * `newFee`: New fee amount (max `1000` = 10%).

---

### 🔍 Read Functions (View)

#### `fetchAllListings() → NFTDetails[]`

* Fetch details of all fractionalized NFTs.

## 📦 Structs

### `NFTDetails`

* `nftOwner`: Original owner.
* `nftId`: Token ID.
* `metadata`: NFT metadata.
* `totalSupply`: ERC20 supply.
* `pricePerFraction`: Cost of one fraction.
* `erc20TokenAddress`: Address of ERC20 token.
* `isFractionalized`: Boolean status.

### `NFTResaleDetails`

* `seller`: Address selling the fraction.
* `amount`: Total listed.
* `amountSold`: Number sold.
* `pricePerFraction`: Price each.

## 📢 Events

* `NFTFractionalized(uint256 nftId, address erc20Token, uint256 totalSupply, uint256 pricePerFraction)`
* `FractionBought(address buyer, address erc20Token, uint256 amount, uint256 pricePaid)`
* `RoyaltyDistributed(address erc20Token, uint256 amount, uint256 timestamp)`
