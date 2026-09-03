/** @type import('hardhat/config').HardhatUserConfig */
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-ignition";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import "@openzeppelin/hardhat-upgrades"
import dotenv from "dotenv";
import "@typechain/hardhat";
import 'solidity-coverage'

dotenv.config();

const config = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 100,
      },
    },
  },
  typechain: {
    outDir: "typechain-types",
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
    },
    baseSepolia: {
      url: process.env.RPC_URL || "",
      accounts: [process.env.PRIVATE_KEY || ""],
    },
    baseMainnet: {
      url: 'https://mainnet.base.org',
      accounts: [process.env.PRIVATE_KEY as string],
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || ""
  },
};

export default config;