import { deployWithUSDC } from "../helpers/utils";
import { ethers } from "hardhat";
import { expect } from "chai";

describe("Marketplace - Admin", function () {
    it("should allow only owner to set platform fee", async () => {
        const { marketplace, seller, owner } = await deployWithUSDC();

        await marketplace.connect(owner).setPlatformFee(50);
        expect(await marketplace.platformFee()).to.equal(50);

        await expect(
            marketplace.connect(seller).setPlatformFee(100)
        ).to.be.reverted
    });

    it("should allow owner to withdraw ERC20 tokens", async () => {
        const { marketplace, usdc, relister, owner } = await deployWithUSDC();
        const amount = ethers.parseUnits("100", 6);
        await usdc.connect(relister).transfer(marketplace.target, amount);

        await marketplace.connect(owner).withdrawERC20(usdc.target, amount);
        expect(await usdc.balanceOf(owner.address)).to.equal(amount);
    });

    it("should revert state-changing operations when paused", async () => {
        const { marketplace, seller, owner } = await deployWithUSDC();

        await marketplace.connect(owner).pause();
        await expect(marketplace.connect(seller).mintAndFractionalizeNFT(10n, 1n, "{}")).to.be.reverted
        await marketplace.connect(owner).unpause();
    });
});
