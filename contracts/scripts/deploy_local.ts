/**
 * Local e2e deployment.
 *
 * Usage (from the contracts/ directory, against a running local node):
 *   npx hardhat node                                    # terminal 1
 *   npx hardhat run scripts/deploy_local.ts --network localhost
 *
 * Deploys:
 *   - a mock USDC (the repo's ERC20Token; note it reports 18 via decimals()
 *     but every amount in the marketplace is raw base units treated as micro
 *     USDC, matching production semantics),
 *   - the Marketplace behind a transparent proxy, initialized with the mock
 *     USDC address and the deployer as fee recipient,
 *   - funds the first FUND_ACCOUNTS (default 10, i.e. every standard hardhat
 *     account) test accounts with mock USDC. The e2e wallet roster
 *     (e2e/wallets.ts, shared with scripts/seed.ts) maps roles onto accounts
 *     0..5 in this exact order, so keep the key list below unchanged.
 *
 * Writes addresses plus the well-known hardhat test private keys to
 * e2e/.chain.json at the repo root (gitignored) for Playwright and the
 * indexer scripts. Refuses to write keys on non-local networks.
 */

import { ethers, upgrades, network } from 'hardhat';
import * as fs from 'fs';
import * as path from 'path';

// The standard hardhat development mnemonic accounts. Test-only keys, never
// funded on a real network.
const HARDHAT_PRIVATE_KEYS = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  '0x47e179ec197488593b187f80a4cb0f14a26591f9c96b56b56cf6a0b7e13f9b46',
  '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba',
  '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e',
  '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356',
  '0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97',
  '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6',
];

const LOCAL_NETWORKS = new Set(['hardhat', 'localhost']);

async function main() {
  if (!LOCAL_NETWORKS.has(network.name)) {
    throw new Error(
      `deploy_local.ts is for local networks only (got "${network.name}"). Use deploy_upgradeable_marketplace.ts for real networks.`,
    );
  }

  const signers = await ethers.getSigners();
  const deployer = signers[0];
  console.log('Deployer:', deployer.address);

  // Mock USDC: raw base units are treated as micro USDC (6 decimals) by the
  // marketplace and the app, regardless of the token's decimals() value.
  const ERC20Token = await ethers.getContractFactory('ERC20Token');
  const usdc = await ERC20Token.deploy('USD Coin (Mock)', 'USDC');
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log('Mock USDC deployed to:', usdcAddress);

  const feeRecipient = deployer.address;
  const Marketplace = await ethers.getContractFactory('Marketplace');
  const marketplace = await upgrades.deployProxy(Marketplace, [usdcAddress, feeRecipient], {
    initializer: 'initialize',
  });
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();
  console.log('Marketplace proxy deployed to:', marketplaceAddress);

  const fundCount = Math.min(
    Number.parseInt(process.env.FUND_ACCOUNTS || '10', 10) || 10,
    signers.length,
    HARDHAT_PRIVATE_KEYS.length,
  );
  // 1,000,000 USDC in micro units per account.
  const fundAmount = ethers.parseUnits('1000000', 6);
  const funded: Array<{ address: string; privateKey: string }> = [];
  for (let i = 0; i < fundCount; i += 1) {
    const account = signers[i];
    const tx = await usdc.mint(account.address, fundAmount);
    await tx.wait();
    funded.push({ address: account.address, privateKey: HARDHAT_PRIVATE_KEYS[i] });
    console.log(`Funded ${account.address} with 1,000,000 mock USDC`);
  }

  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const output = {
    generatedAt: new Date().toISOString(),
    network: network.name,
    chainId,
    rpcUrl: 'http://127.0.0.1:8545',
    marketplace: marketplaceAddress,
    usdc: usdcAddress,
    feeRecipient,
    usdcNote:
      'ERC20Token reports decimals()=18 but all marketplace amounts are raw base units treated as micro USDC (6 decimals).',
    accounts: funded,
  };

  const outPath = path.resolve(__dirname, '..', '..', 'e2e', '.chain.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log('Wrote', outPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
