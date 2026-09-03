import { deployWithUSDC } from "../helpers/utils";
import { expect } from "chai";

describe("Marketplace - Core Minting", function () {
    it("should mint and fractionalize NFT", async () => {
        const { marketplace, seller } = await deployWithUSDC();
        const supply = 10n, price = 1n;
        const metadata = JSON.stringify({ name: "NFT" });

        await marketplace.connect(seller).mintAndFractionalizeNFT(supply, price, metadata);
        const listings = await marketplace.fetchAllListings();

        expect(listings.length).to.equal(1);
        expect(listings[0].pricePerFraction).to.equal(price);
    });

    it("should fail if supply or price is 0", async () => {
        const { marketplace, seller } = await deployWithUSDC();
        await expect(marketplace.connect(seller).mintAndFractionalizeNFT(0, 1, ""))
            .to.be.revertedWith("Total supply must be greater than zero");
        await expect(marketplace.connect(seller).mintAndFractionalizeNFT(1, 0, ""))
            .to.be.revertedWith("Price per fraction must be positive");
    });
});
