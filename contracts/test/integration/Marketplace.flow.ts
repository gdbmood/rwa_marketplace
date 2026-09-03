import { deployWithUSDC } from "../helpers/utils";
import { ethers } from "hardhat";

describe("Marketplace - Full Flow", function () {
    it("should complete full mint → buy → resale → buy → royalty", async () => {
        const { marketplace, usdc, seller, relister, buyer } = await deployWithUSDC();

        const supply = 10n;
        const price = 1n;
        const metadata = JSON.stringify({ name: "NFT" });

        await marketplace.connect(seller).mintAndFractionalizeNFT(supply, price, metadata);
        const listings = await marketplace.fetchAllListings();
        const nftId = listings[0].nftId;
        const erc20 = await ethers.getContractAt("ERC20Token", listings[0].erc20TokenAddress);

        await erc20.connect(seller).approve(marketplace.target, supply);

        await usdc.connect(relister).approve(marketplace.target, ethers.parseUnits("1000", 6));
        await marketplace.connect(relister).buyFractions(nftId, 3n);

        await erc20.connect(relister).approve(marketplace.target, 1n);
        await marketplace.connect(relister).sellFractions(nftId, 1n, 2n);

        await usdc.connect(buyer).approve(marketplace.target, ethers.parseUnits("1000", 6));
        await marketplace.connect(buyer).buyFractions(nftId, 2n);

        await marketplace.connect(seller).depositRevenue(nftId, { value: ethers.parseEther("1") });
    });
});
