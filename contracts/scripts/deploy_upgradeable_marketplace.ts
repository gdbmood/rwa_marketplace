import { ethers, upgrades } from 'hardhat';

const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // Replace with the actual USDC contract address, this corresponds to the USDC contract on the Sepolia testnet
const FEE_RECIPIENT_ADDRESS = ""; // Replace with the actual fee recipient address

async function main() {
    const Marketplace = await ethers.getContractFactory('Marketplace');
    const marketplace = await upgrades.deployProxy(Marketplace, [USDC_ADDRESS, FEE_RECIPIENT_ADDRESS], { initializer: 'initialize' });
    await marketplace.waitForDeployment();
    console.log('Marketplace deployed to:', await marketplace.getAddress());
}

main();