import { deployWithUSDC } from "../helpers/utils";
import { ethers } from "hardhat";
import { expect } from "chai";

describe("Marketplace - Failures", function () {
    it("should fail to buy more than listed", async () => {
        const { marketplace, usdc, seller, buyer } = await deployWithUSDC();
        const supply = 5n, price = 1n;
        const metadata = "{}";

        await marketplace.connect(seller).mintAndFractionalizeNFT(supply, price, metadata);
        const listings = await marketplace.fetchAllListings();
        const nftId = listings[0].nftId;

        await usdc.connect(buyer).approve(marketplace.target, ethers.parseUnits("1000", 6));
        await expect(
            marketplace.connect(buyer).buyFractions(nftId, 10n)
        ).to.be.revertedWith("Not enough fractions listed for sale");
    });
});
