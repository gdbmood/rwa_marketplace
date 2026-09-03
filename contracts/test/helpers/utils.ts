import hre from "hardhat";
import { ethers } from "hardhat";

export async function deployWithUSDC() {
    const [owner, seller, relister, buyer] = await ethers.getSigners();

    const USDCToken = await hre.ethers.getContractFactory("ERC20Token");
    const usdc = await USDCToken.deploy("USD Coin", "USDC");

    await usdc.mint(relister.address, ethers.parseUnits("1000", 6));
    await usdc.mint(buyer.address, ethers.parseUnits("1000", 6));

    const Marketplace = await hre.ethers.getContractFactory("Marketplace");
    const marketplace = await hre.upgrades.deployProxy(Marketplace, [usdc.target, owner.address], {
        initializer: "initialize",
    });

    return { marketplace, usdc, owner, seller, relister, buyer };
}
