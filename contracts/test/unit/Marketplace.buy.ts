import { deployWithUSDC } from "../helpers/utils";
import { ethers } from "hardhat";
import { expect } from "chai";

describe("Marketplace - Buying", function () {
    it ("should buy all fractions", async () => {
        const { marketplace, usdc, seller, buyer } = await deployWithUSDC();
        const supply = 5n, price = 1n;
        const metadata = "{}";

        await marketplace.connect(seller).mintAndFractionalizeNFT(supply, price, metadata);
        const listings = await marketplace.fetchAllListings();
        const nftId = listings[0].nftId;
        const erc20 = await ethers.getContractAt("ERC20Token", listings[0].erc20TokenAddress);

        await erc20.connect(seller).approve(marketplace.target, supply);
        await usdc.connect(buyer).approve(marketplace.target, ethers.parseUnits("1000", 6));
        await expect(
            marketplace.connect(buyer).buyFractions(nftId, 5n)
        ).to.be.fulfilled;
    });

    it("should buy fractions and transfer USDC", async () => {
        const { marketplace, usdc, seller, buyer } = await deployWithUSDC();
        const supply = 10n, price = 1n;
        const metadata = JSON.stringify({ name: "NFT" });

        await marketplace.connect(seller).mintAndFractionalizeNFT(supply, price, metadata);
        const listings = await marketplace.fetchAllListings();
        const nftId = listings[0].nftId;
        const erc20 = await ethers.getContractAt("ERC20Token", listings[0].erc20TokenAddress);

        await erc20.connect(seller).approve(marketplace.target, supply);
        await usdc.connect(buyer).approve(marketplace.target, ethers.parseUnits("100", 6));
        await marketplace.connect(buyer).buyFractions(nftId, 2n);

        expect(await erc20.balanceOf(buyer.address)).to.equal(2n);
    });

    it("should fail if buyer has insufficient USDC", async () => {
        const { marketplace, usdc, seller, buyer } = await deployWithUSDC();
        const supply = 10n, price = 2n;
        const metadata = JSON.stringify({ name: "Expensive NFT" });

        await marketplace.connect(seller).mintAndFractionalizeNFT(supply, price, metadata);
        const nftId = (await marketplace.fetchAllListings())[0].nftId;

        await usdc.connect(buyer).approve(marketplace.target, 1); // way too low
        await expect(
            marketplace.connect(buyer).buyFractions(nftId, 5n)
        ).to.be.revertedWith("Insufficient USDC allowance for transfer");
    });
});
