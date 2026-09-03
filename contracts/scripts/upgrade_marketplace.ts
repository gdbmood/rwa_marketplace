const { ethers, upgrades } = require('hardhat');

async function main() {
    const Marketplace = await ethers.getContractFactory('Marketplace');
    await upgrades.upgradeProxy(process.env.DEPLOYED_MARKETPLACE_ADDRESS, Marketplace);
    console.log('Marketplace upgraded');
}

main();