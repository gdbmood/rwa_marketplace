import { deployWithUSDC } from "../helpers/utils";
import { ethers } from "hardhat";
import { expect } from "chai";

describe("Marketplace - Selling", function () {
    it("should allow relisting of fractions", async () => {
        const { marketplace, usdc, seller, relister } = await deployWithUSDC();
        const supply = 10n, price = 1n;
        const metadata = JSON.stringify({ name: "NFT" });

        await marketplace.connect(seller).mintAndFractionalizeNFT(supply, price, metadata);
        const listings = await marketplace.fetchAllListings();
        const nftId = listings[0].nftId;
        const erc20 = await ethers.getContractAt("ERC20Token", listings[0].erc20TokenAddress);

        await erc20.connect(seller).approve(marketplace.target, supply);
        await usdc.connect(relister).approve(marketplace.target, ethers.parseUnits("1000", 6));
        await marketplace.connect(relister).buyFractions(nftId, 5n);
        await erc20.connect(relister).approve(marketplace.target, 2n);

        await marketplace.connect(relister).sellFractions(nftId, 2n, 2n);
    });

    it("should not allow non-owner to update listing", async () => {
        const { marketplace, seller, buyer } = await deployWithUSDC();
        const supply = 5n, price = 1n;
        const metadata = JSON.stringify({ name: "NFT" });
        await marketplace.connect(seller).mintAndFractionalizeNFT(supply, price, metadata);

        const listings = await marketplace.fetchAllListings();
        const nftId = listings[0].nftId;

        await expect(
            marketplace.connect(buyer).updateListing(nftId, 3n, metadata)
        ).to.be.revertedWith("Only the owner can update the listing");
    });

    it("should unlist seller’s fractions at given price", async () => {
        const { marketplace, seller } = await deployWithUSDC();
        const supply = 10n, price = 1n;
        const metadata = JSON.stringify({});

        await marketplace.connect(seller).mintAndFractionalizeNFT(supply, price, metadata);
        const nftId = (await marketplace.fetchAllListings())[0].nftId;
        const erc20 = await ethers.getContractAt("ERC20Token", (await marketplace.fetchAllListings())[0].erc20TokenAddress);

        await erc20.connect(seller).approve(marketplace.target, supply);
        await marketplace.connect(seller).sellFractions(nftId, 5n, price);

        await marketplace.connect(seller).unlistFractions(nftId, price);
    });
});
