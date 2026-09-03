/**
 * Single source of truth for the e2e wallet roster.
 *
 * The addresses below are the standard hardhat development accounts, in the
 * exact order of the private keys hardcoded in
 * contracts/scripts/deploy_local.ts (HARDHAT_PRIVATE_KEYS). Both scripts/seed.ts
 * (database users) and e2e/fixtures.ts (on-chain actors) import this module,
 * so the wallets seeded into Supabase ARE the funded hardhat accounts and
 * chain actions line up with database users.
 *
 * e2e/fixtures.ts additionally cross-checks this list against e2e/.chain.json
 * (written by the deploy script, which derives addresses from the private
 * keys with ethers) and throws on any mismatch, so drift between the two
 * lists cannot go unnoticed.
 *
 * Account 0 doubles as the contract deployer and fee recipient in
 * deploy_local.ts, which is why the admin role sits there.
 */

export const HARDHAT_ADDRESSES = [
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', // 0 deployer / fee recipient / admin
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', // 1 business1
  '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', // 2 business2
  '0x90F79bf6EB2c4f870365E785982E1f101E93b906', // 3 investor1
  '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65', // 4 investor2
  '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc', // 5 investor3
  '0x976EA74026E726554dB657fA54763abd0C3a0aa9', // 6 spare
  '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955', // 7 spare
  '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f', // 8 spare
  '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720', // 9 spare
] as const;

export const WALLET_ROLES = [
  'admin',
  'business1',
  'business2',
  'investor1',
  'investor2',
  'investor3',
] as const;

export type WalletRole = (typeof WALLET_ROLES)[number];

/** Index into HARDHAT_ADDRESSES (and e2e/.chain.json accounts) per role. */
export const HARDHAT_ACCOUNT_INDEX: Record<WalletRole, number> = {
  admin: 0,
  business1: 1,
  business2: 2,
  investor1: 3,
  investor2: 4,
  investor3: 5,
};

/** Role to wallet address map, consumed by scripts/seed.ts. */
export const WALLETS: Record<WalletRole, string> = Object.fromEntries(
  WALLET_ROLES.map((role) => [role, HARDHAT_ADDRESSES[HARDHAT_ACCOUNT_INDEX[role]]]),
) as Record<WalletRole, string>;

/** Default user type per role, used by loginAs when no type is passed. */
export const DEFAULT_USER_TYPE: Record<WalletRole, 'retail' | 'business'> = {
  admin: 'retail',
  business1: 'business',
  business2: 'business',
  investor1: 'retail',
  investor2: 'retail',
  investor3: 'retail',
};
