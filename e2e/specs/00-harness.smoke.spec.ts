/**
 * Harness smoke checks: verifies the orchestrated stack itself before any
 * journey spec runs (file name sorts first under the single worker). If these
 * fail, fix the harness before reading journey spec failures.
 */

import { expect, test } from '../fixtures';

test.describe('e2e harness', () => {
  test('local chain is up with the deployed marketplace', async ({ chain, walletFor }) => {
    const chainIdHex = await chain.rpc<string>('eth_chainId');
    expect(Number.parseInt(chainIdHex, 16)).toBe(31337);

    // The funded roster resolves and matches the seed wallet list.
    const business1 = walletFor('business1');
    expect(business1.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(business1.privateKey).toMatch(/^0x[0-9a-fA-F]{64}$/);

    await chain.mineBlock();
  });

  test('app is serving and test-auth issues a session', async ({ page, loginAs, db }) => {
    const response = await page.goto('/');
    expect(response, 'app did not respond on baseURL').not.toBeNull();
    expect(response!.status()).toBeLessThan(500);

    const wallet = await loginAs(page, 'investor1');

    const user = await db().userByWallet(wallet.address);
    expect(user, 'test-auth should have upserted the users row').not.toBeNull();
    expect(user!.wallet_address).toBe(wallet.address.toLowerCase());
  });

  test('signed sumsub webhook flips verification', async ({
    request,
    sumsubApprove,
    walletFor,
    db,
  }) => {
    const wallet = walletFor('investor2');

    await sumsubApprove(request, wallet.address);
    const approved = await db().userByWallet(wallet.address);
    expect(approved?.is_verified).toBe(true);

    // Leave the seeded state as the suite expects it: investor2 unverified.
    await sumsubApprove(request, wallet.address, 'RED');
    const reset = await db().userByWallet(wallet.address);
    expect(reset?.is_verified).toBe(false);
  });
});
