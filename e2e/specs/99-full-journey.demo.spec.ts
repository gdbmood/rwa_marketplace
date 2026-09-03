/**
 * The long walkthrough recorded as docs/demos/00-full-journey.mp4.
 *
 * One test, so Playwright produces one continuous video covering the whole
 * product in the order a newcomer should see it:
 *
 *   1. a business registers, gets verified through the signed Sumsub webhook,
 *      saves a draft (visible to investors as a Coming soon card), then mints
 *      and lists it on chain,
 *   2. an investor buys fractions with a card through the on-ramp and sees the
 *      holding in the portfolio,
 *   3. that investor lists one fraction for resale at a higher price,
 *   4. a second investor buys the resale, and the indexer settles it.
 *
 * Every step asserts the resulting state, so a broken product fails this spec
 * instead of yielding a misleading video. This file is excluded from the
 * normal suite (playwright.config.ts ignores it) because it re-covers ground
 * the focused specs already assert; it exists for the recording.
 *
 * Actors: the business is hardhat account 6 (the journey wallet, outside the
 * seed roster), the investors are the seeded investor2 and investor3, so the
 * assets and holdings the other specs assert against are left alone.
 */

import { expect, test } from '../fixtures';
import {
  bizUrl,
  fixtureFile,
  loginJourneyBusiness,
  mainUrl,
  num,
  pollUntil,
} from './helpers/business';

const RUN_TAG = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
const ASSET_NAME = `Demo Chronograph ${RUN_TAG}`;
const ASSET_DESCRIPTION = `Full journey walkthrough asset (${RUN_TAG})`;

const VALUATION = '4000';
const FRACTIONS = '100';
const FRACTIONS_COUNT = 100;
const MINT_PRICE = 40;
const RESALE_PRICE = '55';

test.describe('full journey walkthrough', () => {
  test('business lists an asset, an investor buys with a card and resells, a second investor buys the resale', async ({
    page,
    context,
    db,
    loginAs,
    sumsubApprove,
    request,
  }) => {
    // Real transactions, the on-ramp poll loop and the indexer, all at demo
    // speed (the demo config adds 400 ms per action).
    test.setTimeout(900_000);
    const database = db();

    // ---- 1. Business: register, verify, draft, mint and list ----------------

    const businessWallet = await loginJourneyBusiness(page);

    // Start from unverified so the video shows the verification transition
    // even when an earlier spec already verified this wallet.
    await sumsubApprove(request, businessWallet.address, 'RED');
    const businessUser = await pollUntil('the business user row', async () => {
      const result = await database
        .from('users')
        .select('*')
        .eq('wallet_address', businessWallet.address.toLowerCase())
        .maybeSingle();
      expect(result.error).toBeNull();
      return result.data;
    });

    // Park minting leftovers from any crashed run: the indexer falls back to
    // the oldest minting asset for a wallet when no mint hash is recorded yet.
    const parked = await database
      .from('assets')
      .update({ status: 'delisted' })
      .eq('business_id', businessUser.id)
      .eq('status', 'minting');
    expect(parked.error).toBeNull();

    await page.goto(bizUrl('/verify-business'));
    await expect(page.getByRole('heading', { name: /verif/i }).first()).toBeVisible({
      timeout: 30_000,
    });

    await sumsubApprove(request, businessWallet.address, 'GREEN');
    await pollUntil('the business to be verified', async () => {
      const result = await database
        .from('users')
        .select('is_verified')
        .eq('id', businessUser.id)
        .maybeSingle();
      expect(result.error).toBeNull();
      return result.data?.is_verified ? result.data : null;
    });

    await page.goto(bizUrl('/list-new-asset'));
    await expect(page.getByRole('button', { name: 'Save Draft' })).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole('combobox', { name: 'Asset Type' }).click();
    await page.getByRole('option', { name: 'Watches' }).click();

    await page.getByLabel('Title').fill(ASSET_NAME);
    await page.getByLabel('Description').fill(ASSET_DESCRIPTION);
    await page.getByLabel('Brand').fill('Patek Philippe');
    await page.getByLabel('Model').fill('Nautilus');
    await page.getByLabel('Year').fill('2019');
    await page.getByRole('combobox', { name: 'Condition' }).click();
    await page.getByRole('option', { name: 'Used' }).click();

    await page.getByLabel('Valuation (USD)').fill(VALUATION);
    await page.getByLabel('Amounts of Fractions').fill(FRACTIONS);
    await expect(page.getByLabel('Price per Fraction')).toHaveValue(String(MINT_PRICE));

    await page.getByTestId('asset-image-input').setInputFiles(fixtureFile('asset-photo.png'));
    await expect(page.locator('img[alt="asset"]')).toHaveCount(1);
    await page
      .getByTestId('asset-document-input-ownershipRights')
      .setInputFiles(fixtureFile('ownership.pdf'));
    await expect(page.getByText('ownership.pdf')).toBeVisible();

    await page.getByRole('button', { name: 'Save Draft' }).click();
    await expect(page.getByTestId('listing-form-notice')).toContainText('Draft saved', {
      timeout: 45_000,
    });

    const draft = await pollUntil('the draft asset row', async () => {
      const result = await database
        .from('assets')
        .select('*')
        .eq('business_id', businessUser.id)
        .eq('name', ASSET_NAME)
        .maybeSingle();
      expect(result.error).toBeNull();
      return result.data;
    });
    expect(draft.status).toBe('draft');
    const assetId = draft.id;

    // Investors already see it, as a Coming soon card that cannot be bought.
    await page.goto(mainUrl('/marketplace'));
    await page.getByPlaceholder('Search for assets').fill(ASSET_NAME);
    const comingSoon = page
      .getByTestId('marketplace-asset-card')
      .filter({ hasText: ASSET_NAME });
    await expect(comingSoon).toBeVisible({ timeout: 30_000 });
    await expect(comingSoon.getByText('Coming soon')).toBeVisible();

    // Mint and list: a real mintAndFractionalizeNFT transaction, then the
    // indexer promotes the asset and creates the primary listing.
    await page.goto(bizUrl(`/list-new-asset?draft=${assetId}`));
    await expect(page.getByText('Edit Draft Asset')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Mint & List Preview' }).click();
    await expect(page.getByText('Check the publication')).toBeVisible({ timeout: 45_000 });
    await page.getByRole('button', { name: 'Publish Asset' }).click();
    await expect(page.getByText('Asset minted and listed')).toBeVisible({ timeout: 150_000 });

    const listed = await pollUntil('the asset to go active on chain', async () => {
      const result = await database.from('assets').select('*').eq('id', assetId).maybeSingle();
      expect(result.error).toBeNull();
      const row = result.data;
      return row && row.status === 'active' && row.nft_id !== null ? row : null;
    });
    expect(listed.total_supply).toBe(FRACTIONS_COUNT);

    await page.getByRole('button', { name: 'Go to dashboard' }).click();
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
    const dashboardCard = page
      .getByTestId('business-asset-card')
      .filter({ hasText: ASSET_NAME });
    await expect(dashboardCard).toBeVisible({ timeout: 30_000 });

    // ---- 2. Investor A buys with a card through the on-ramp ----------------

    // A fresh browser context per actor: separate session cookie and separate
    // test-mode signer key, exactly like two different people.
    const investorAContext = await context.browser()!.newContext();
    const investorAPage = await investorAContext.newPage();
    const investorAWallet = await loginAs(investorAPage, 'investor2');
    const investorA = (await database
      .from('users')
      .select('*')
      .eq('wallet_address', investorAWallet.address.toLowerCase())
      .maybeSingle()
      .then((r) => r.data))!;
    expect(investorA, 'investor2 must be seeded').toBeTruthy();

    await investorAPage.goto(mainUrl('/marketplace'));
    await investorAPage.getByPlaceholder('Search for assets').fill(ASSET_NAME);
    const buyableCard = investorAPage
      .getByTestId('marketplace-asset-card')
      .filter({ hasText: ASSET_NAME });
    await expect(buyableCard).toBeVisible({ timeout: 30_000 });
    await expect(buyableCard.getByText('per fraction')).toBeVisible();

    await investorAPage.goto(mainUrl(`/asset/${assetId}/buy/2`));
    await investorAPage.getByRole('tab', { name: 'Card' }).click();

    const popupPromise = investorAContext.waitForEvent('page');
    await investorAPage.getByRole('button', { name: 'Pay with card' }).click();
    await expect(
      investorAPage.getByText('Complete the payment in the provider tab.'),
    ).toBeVisible({ timeout: 60_000 });

    const providerTab = await popupPromise;
    await providerTab.waitForLoadState();
    await expect(providerTab.getByText('Mock payment provider')).toBeVisible();
    await providerTab.getByRole('button', { name: 'Complete payment' }).click();
    await expect(providerTab.getByText(/Payment completed/)).toBeVisible({ timeout: 60_000 });
    await providerTab.close();

    // Funded, then the on-chain purchase runs and the indexer settles it.
    await expect(investorAPage.getByText('Purchase complete')).toBeVisible({
      timeout: 180_000,
    });

    await investorAPage.getByRole('button', { name: 'Go to portfolio' }).click();
    await investorAPage.waitForURL('**/portfolio');
    await expect(
      investorAPage.getByTestId('portfolio-holding').first().or(
        investorAPage.getByText('No fractions yet'),
      ),
    ).toBeVisible({ timeout: 30_000 });
    const viewMoreA = investorAPage.getByRole('button', { name: 'View More' });
    for (let i = 0; i < 30 && (await viewMoreA.isVisible()); i += 1) {
      await viewMoreA.click();
    }
    const holdingCard = investorAPage
      .getByTestId('portfolio-holding')
      .filter({ hasText: ASSET_NAME });
    await expect(holdingCard).toHaveCount(1, { timeout: 30_000 });

    // ---- 3. Investor A lists one fraction for resale ------------------------

    await holdingCard.getByRole('button', { name: 'Sell', exact: true }).click();
    const sellDialog = investorAPage.getByRole('dialog');
    await expect(sellDialog.getByText('Sell fractions')).toBeVisible();
    await sellDialog.getByLabel('Price per fraction (USDC)').fill(RESALE_PRICE);
    await sellDialog.getByRole('button', { name: 'List for sale' }).click();
    await expect(sellDialog.getByText('Listing created')).toBeVisible({ timeout: 90_000 });
    await sellDialog.getByRole('button', { name: 'Done' }).click();

    const resale = await pollUntil('the secondary listing row', async () => {
      const result = await database
        .from('listings')
        .select('*')
        .eq('asset_id', assetId)
        .eq('kind', 'secondary')
        .eq('lister_id', investorA.id)
        .eq('status', 'active')
        .maybeSingle();
      expect(result.error).toBeNull();
      return result.data;
    });
    expect(num(resale.price_per_fraction)).toBe(Number(RESALE_PRICE));

    // ---- 4. Investor B buys the resale -------------------------------------

    const investorBContext = await context.browser()!.newContext();
    const investorBPage = await investorBContext.newPage();
    const investorBWallet = await loginAs(investorBPage, 'investor3');
    const investorB = (await database
      .from('users')
      .select('*')
      .eq('wallet_address', investorBWallet.address.toLowerCase())
      .maybeSingle()
      .then((r) => r.data))!;
    expect(investorB, 'investor3 must be seeded').toBeTruthy();

    // The asset page shows the resale row alongside the primary listing.
    await investorBPage.goto(mainUrl(`/asset/${assetId}`));
    const resaleRow = investorBPage.getByRole('row').filter({ hasText: 'Resale' });
    await expect(resaleRow.first()).toBeVisible({ timeout: 30_000 });

    await investorBPage.goto(mainUrl(`/asset/${assetId}/buy/1`));
    await investorBPage.getByRole('button', { name: 'Buy with USDC' }).click();
    await expect(investorBPage.getByText('Purchase complete')).toBeVisible({
      timeout: 180_000,
    });

    // The resale filled: the seller's listing is gone and the buyer holds it.
    await pollUntil('the resale listing to be filled', async () => {
      const result = await database
        .from('listings')
        .select('status, quantity')
        .eq('id', resale.id)
        .maybeSingle();
      expect(result.error).toBeNull();
      const row = result.data;
      return row && (row.status === 'filled' || row.quantity === 0) ? row : null;
    });

    const buyerHolding = await pollUntil("the second investor's holding", async () => {
      const result = await database
        .from('holdings')
        .select('quantity')
        .eq('user_id', investorB.id)
        .eq('asset_id', assetId)
        .maybeSingle();
      expect(result.error).toBeNull();
      return result.data && result.data.quantity > 0 ? result.data : null;
    });
    expect(buyerHolding.quantity).toBeGreaterThanOrEqual(1);

    await investorBPage.getByRole('button', { name: 'Go to portfolio' }).click();
    await investorBPage.waitForURL('**/portfolio');
    await expect(
      investorBPage.getByTestId('portfolio-holding').first().or(
        investorBPage.getByText('No fractions yet'),
      ),
    ).toBeVisible({ timeout: 30_000 });

    await investorAContext.close();
    await investorBContext.close();
  });
});
