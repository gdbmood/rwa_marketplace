/**
 * BUSINESS journeys (docs/PRODUCT_KNOWLEDGE.md section 4.1 and 4.4), end to
 * end against the real app, the local hardhat chain, the indexer loop and the
 * remote Supabase project:
 *
 *   register -> complete profile -> KYB via the signed Sumsub webhook ->
 *   create draft listing (Watches category: string, number, dropdown and
 *   document fields, image + document uploads) -> edit draft -> Coming soon
 *   card in the marketplace -> mint and list (real mintAndFractionalizeNFT
 *   transaction signed by the test wallet, indexer promotes the asset and
 *   creates the primary listing) -> dashboard sales view -> update listing
 *   metadata and primary price (updateListing on chain) -> delist remaining
 *   fractions (unlistFractions on chain) -> transactions and revenue on the
 *   dashboard -> settings persistence.
 *
 * The journey actor is hardhat account 6 (see e2e/specs/helpers/business.ts):
 * funded on chain but NOT in the seed roster, so the first test-auth POST of
 * a run exercises real registration and seeded users stay untouched.
 *
 * Re-entrancy against the shared remote database (never reset between runs):
 *   - the asset name is unique per worker process (retries of this serial
 *     file restart the worker and mint a fresh asset),
 *   - the journey user is normalized at the start (type business, RED webhook
 *     resets is_verified) instead of assuming a fresh row,
 *   - leftover "minting" assets from crashed runs are parked as delisted
 *     before publishing, so the indexer's oldest-minting-asset fallback can
 *     never promote a stale asset instead of ours,
 *   - database assertions target rows keyed by this run's asset id, not
 *     absolute table state.
 */

import { expect, test } from '../fixtures';
import {
  bizUrl,
  fixtureFile,
  journeyWallet,
  loginJourneyBusiness,
  mainUrl,
  metadataOf,
  num,
  pollUntil,
  settingsOf,
} from './helpers/business';

// Unique per worker process: a serial retry restarts the worker, so a rerun
// gets a fresh asset instead of colliding with the half-finished one.
const RUN_TAG = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
const ASSET_NAME = `E2E Watch ${RUN_TAG}`;
const ASSET_DESCRIPTION = `Playwright business journey watch (${RUN_TAG})`;
const ASSET_DESCRIPTION_EDITED = `${ASSET_DESCRIPTION}, edited before mint`;
const ASSET_DESCRIPTION_UPDATED = `${ASSET_DESCRIPTION}, updated after listing`;

const PROFILE = {
  displayName: 'Aurora Timepieces',
  legalName: 'Aurora Timepieces FZE',
  email: 'aurora@e2e.local',
  phone: '0501234567',
};

// Draft numbers: 5000 / 100 = 50 per fraction; edited to 6000 (60); primary
// price updated on chain to 7000 / 100 = 70 after listing.
const DRAFT_VALUATION = '5000';
const EDITED_VALUATION = '6000';
const UPDATED_VALUATION = '7000';
const FRACTIONS = '100';
const FRACTIONS_COUNT = 100;
const EDITED_PRICE = 60;
const UPDATED_PRICE = 70;

// Shared serial-chain state, assigned as the journey progresses.
let userId = '';
let assetId = '';
let nftId = 0;

test.describe.serial('business journey', () => {
  test('registers on first login and lands behind the verification gate', async ({
    page,
    request,
    sumsubApprove,
    db,
  }) => {
    const wallet = await loginJourneyBusiness(page);
    const database = db();

    // The first ever login created the users row; later runs reuse it. The
    // remote database is not reset between runs, so normalize the journey
    // user back to its starting state: business type, not verified.
    const typeFix = await database
      .from('users')
      .update({ type: 'business' })
      .eq('wallet_address', wallet.address.toLowerCase());
    expect(typeFix.error).toBeNull();
    await sumsubApprove(request, wallet.address, 'RED');

    const user = await database.userByWallet(wallet.address);
    expect(user, 'test-auth should have created the users row').not.toBeNull();
    expect(user!.type).toBe('business');
    expect(user!.is_verified).toBe(false);
    expect(user!.wallet_address).toBe(wallet.address.toLowerCase());
    userId = user!.id;

    // Unverified businesses cannot reach the dashboard: the gate forwards
    // them to KYB.
    await page.goto(bizUrl('/dashboard'));
    await expect(page).toHaveURL(/\/verify-business$/, { timeout: 30_000 });
  });

  test('completes the business profile', async ({ page, db }) => {
    await loginJourneyBusiness(page);

    await page.goto(bizUrl('/profile'));
    await expect(page.getByText('Account details')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('kyb-not-approved')).toBeVisible();

    await page.getByRole('button', { name: 'Edit account details' }).click();
    await page.getByLabel('Display Name').fill(PROFILE.displayName);
    await page.getByLabel('Legal Name').fill(PROFILE.legalName);
    await page.getByLabel('Email').fill(PROFILE.email);

    // Error path: an invalid phone number blocks the save with a visible
    // validation message.
    await page.getByLabel('Phone Number').fill('123');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByTestId('business-profile-error')).toHaveText(
      'Invalid phone number',
    );

    await page.getByLabel('Phone Number').fill(PROFILE.phone);
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByTestId('business-profile-notice')).toHaveText(
      'Profile updated',
      { timeout: 20_000 },
    );

    const user = await db().userByWallet(journeyWallet().address);
    expect(user).not.toBeNull();
    expect(user!.display_name).toBe(PROFILE.displayName);
    expect(user!.legal_name).toBe(PROFILE.legalName);
    expect(user!.email).toBe(PROFILE.email);
    expect(user!.phone).toBe(PROFILE.phone);
  });

  test('is verified through the signed Sumsub webhook', async ({
    page,
    request,
    sumsubApprove,
    db,
  }) => {
    const wallet = journeyWallet();

    await sumsubApprove(request, wallet.address);
    const user = await db().userByWallet(wallet.address);
    expect(user?.is_verified, 'GREEN webhook should flip is_verified').toBe(true);

    // The verified state is visible in the UI: KYB badge on the profile.
    await loginJourneyBusiness(page);
    await page.goto(bizUrl('/profile'));
    await expect(page.getByTestId('kyb-approved')).toBeVisible({ timeout: 30_000 });

    // And the KYB screen now forwards straight to the dashboard.
    await page.goto(bizUrl('/verify-business'));
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
    await expect(page.getByText('Summary Metrics')).toBeVisible();
  });

  test('rejects an invalid listing form with validation messages', async ({ page }) => {
    await loginJourneyBusiness(page);

    await page.goto(bizUrl('/list-new-asset'));
    await expect(page.getByRole('button', { name: 'Mint & List Preview' })).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole('button', { name: 'Mint & List Preview' }).click();
    await expect(page.getByTestId('listing-form-error')).toHaveText(
      'All fields are required',
    );

    await page.getByRole('button', { name: 'Save Draft' }).click();
    await expect(page.getByTestId('listing-form-error')).toHaveText(
      'A title is required to save a draft',
    );
  });

  test('creates a draft listing with per-class fields, image and document', async ({
    page,
    db,
  }) => {
    await loginJourneyBusiness(page);

    await page.goto(bizUrl('/list-new-asset'));
    await expect(page.getByRole('button', { name: 'Save Draft' })).toBeVisible({
      timeout: 30_000,
    });

    // Category first: switching categories resets dynamic values and uploads.
    await page.getByRole('combobox', { name: 'Asset Type' }).click();
    await page.getByRole('option', { name: 'Watches' }).click();

    await page.getByLabel('Title').fill(ASSET_NAME);
    await page.getByLabel('Description').fill(ASSET_DESCRIPTION);

    // Watches category fields: string, string, bounded number, dropdown.
    await page.getByLabel('Brand').fill('Rolex');
    await page.getByLabel('Model').fill('Submariner');
    await page.getByLabel('Year').fill('2015');
    await page.getByRole('combobox', { name: 'Condition' }).click();
    await page.getByRole('option', { name: 'Used' }).click();

    await page.getByLabel('Valuation (USD)').fill(DRAFT_VALUATION);
    await page.getByLabel('Amounts of Fractions').fill(FRACTIONS);
    await expect(page.getByLabel('Price per Fraction')).toHaveValue('50');

    // Image upload through the dropzone input, then the thumbnail appears.
    await page
      .getByTestId('asset-image-input')
      .setInputFiles(fixtureFile('asset-photo.png'));
    await expect(page.locator('img[alt="asset"]')).toHaveCount(1);

    // Ownership Rights document (the Watches document field).
    await page
      .getByTestId('asset-document-input-ownershipRights')
      .setInputFiles(fixtureFile('ownership.pdf'));
    await expect(page.getByText('ownership.pdf')).toBeVisible();

    await page.getByRole('button', { name: 'Save Draft' }).click();
    await expect(page.getByTestId('listing-form-notice')).toContainText('Draft saved', {
      timeout: 45_000,
    });

    const database = db();
    const asset = await pollUntil('the draft asset row', async () => {
      const result = await database
        .from('assets')
        .select('*')
        .eq('business_id', userId)
        .eq('name', ASSET_NAME)
        .maybeSingle();
      expect(result.error).toBeNull();
      return result.data;
    });
    assetId = asset.id;

    expect(asset.status).toBe('draft');
    expect(asset.total_supply).toBe(FRACTIONS_COUNT);
    expect(num(asset.valuation)).toBe(5000);
    expect(num(asset.mint_price_per_fraction)).toBe(50);
    expect(asset.kyc_required).toBe(false);

    const metadata = metadataOf(asset);
    expect(metadata.assetClass).toBe('Watches');
    expect(metadata.brand).toBe('Rolex');
    expect(metadata.model).toBe('Submariner');
    expect(metadata.year).toBe(2015);
    expect(metadata.condition).toBe('Used');
    expect(Array.isArray(metadata.imageUrls) && metadata.imageUrls.length).toBe(1);
    const documents = metadata.documentUrls as Record<string, string[]>;
    expect(documents.ownershipRights?.length).toBe(1);
  });

  test('edits the draft and shows the Coming soon card in the marketplace', async ({
    page,
    db,
  }) => {
    await loginJourneyBusiness(page);

    // The dashboard shows the draft as a Coming soon card with an edit entry.
    await page.goto(bizUrl('/dashboard'));
    const card = page.getByTestId('business-asset-card').filter({ hasText: ASSET_NAME });
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.getByText('Coming soon')).toBeVisible();

    await card.getByRole('link', { name: 'Edit draft' }).click();
    await expect(page).toHaveURL(/\/list-new-asset\?draft=/, { timeout: 30_000 });
    await expect(page.getByText('Edit Draft Asset')).toBeVisible();
    await expect(page.getByLabel('Title')).toHaveValue(ASSET_NAME);

    await page.getByLabel('Description').fill(ASSET_DESCRIPTION_EDITED);
    await page.getByLabel('Valuation (USD)').fill(EDITED_VALUATION);
    await expect(page.getByLabel('Price per Fraction')).toHaveValue(String(EDITED_PRICE));

    await page.getByRole('button', { name: 'Save Draft' }).click();
    await expect(page.getByTestId('listing-form-notice')).toContainText('Draft saved', {
      timeout: 45_000,
    });

    const database = db();
    await pollUntil('the edited draft to persist', async () => {
      const result = await database
        .from('assets')
        .select('*')
        .eq('id', assetId)
        .maybeSingle();
      expect(result.error).toBeNull();
      const row = result.data;
      return row && num(row.valuation) === 6000 && row.description === ASSET_DESCRIPTION_EDITED
        ? row
        : null;
    });

    // Investor view: the draft renders as a Coming soon card, no price.
    await page.goto(mainUrl('/marketplace'));
    await page.getByPlaceholder('Search for assets').fill(ASSET_NAME);
    const marketCard = page
      .getByTestId('marketplace-asset-card')
      .filter({ hasText: ASSET_NAME });
    await expect(marketCard).toBeVisible({ timeout: 30_000 });
    await expect(marketCard.getByText('Coming soon')).toBeVisible();
    await expect(marketCard.getByText('Not yet purchasable')).toBeVisible();
  });

  test('mints and lists the asset on the local chain', async ({ page, db }) => {
    // Real transactions plus the indexer promotion loop: give the whole
    // journey extra room beyond the suite default.
    test.setTimeout(240_000);

    const database = db();

    // Park any minting leftovers from previous crashed runs: the indexer
    // falls back to "oldest minting asset for this wallet" when a mint tx
    // hash is not recorded yet, and a stale row must never win that race.
    const parked = await database
      .from('assets')
      .update({ status: 'delisted' })
      .eq('business_id', userId)
      .eq('status', 'minting');
    expect(parked.error).toBeNull();

    await loginJourneyBusiness(page);
    await page.goto(bizUrl(`/list-new-asset?draft=${assetId}`));
    await expect(page.getByText('Edit Draft Asset')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Mint & List Preview' }).click();
    await expect(page.getByText('Check the publication')).toBeVisible({
      timeout: 45_000,
    });

    // Publish: mintAndFractionalizeNFT signed by the test wallet, then
    // markAssetMinting, then the modal polls until the indexer promotes the
    // asset and finishes with the marketplace ERC20 approval.
    await page.getByRole('button', { name: 'Publish Asset' }).click();
    await expect(page.getByText('Asset minted and listed')).toBeVisible({
      timeout: 150_000,
    });

    // Chain truth reconciled into the database by the indexer.
    const asset = await pollUntil('the asset to be active with chain data', async () => {
      const result = await database
        .from('assets')
        .select('*')
        .eq('id', assetId)
        .maybeSingle();
      expect(result.error).toBeNull();
      const row = result.data;
      return row && row.status === 'active' && row.nft_id !== null && row.erc20_token_address
        ? row
        : null;
    });
    nftId = asset.nft_id as number;
    expect(asset.erc20_token_address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(asset.mint_tx_hash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(asset.total_supply).toBe(FRACTIONS_COUNT);

    const listing = await pollUntil('the primary listing row', async () => {
      const result = await database
        .from('listings')
        .select('*')
        .eq('asset_id', assetId)
        .eq('kind', 'primary')
        .eq('status', 'active')
        .maybeSingle();
      expect(result.error).toBeNull();
      return result.data;
    });
    expect(listing.lister_id).toBe(userId);
    expect(listing.quantity).toBe(FRACTIONS_COUNT);
    expect(num(listing.price_per_fraction)).toBe(EDITED_PRICE);

    await pollUntil('the mint transaction row', async () => {
      const result = await database
        .from('transactions')
        .select('*')
        .eq('asset_id', assetId)
        .eq('type', 'mint')
        .maybeSingle();
      expect(result.error).toBeNull();
      return result.data;
    });

    await page.getByRole('button', { name: 'Go to dashboard' }).click();
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });

    // The marketplace card is now purchasable with the primary price.
    await page.goto(mainUrl('/marketplace'));
    await page.getByPlaceholder('Search for assets').fill(ASSET_NAME);
    const marketCard = page
      .getByTestId('marketplace-asset-card')
      .filter({ hasText: ASSET_NAME });
    await expect(marketCard).toBeVisible({ timeout: 30_000 });
    await expect(marketCard.getByText('per fraction')).toBeVisible();
    await expect(marketCard.getByText('Coming soon')).toHaveCount(0);
  });

  test('shows the asset with the sales view on the dashboard', async ({ page }) => {
    await loginJourneyBusiness(page);
    await page.goto(bizUrl('/dashboard'));

    // Summary metrics header of the sales view.
    await expect(page.getByText('Summary Metrics')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Total Raised Funds')).toBeVisible();

    const card = page.getByTestId('business-asset-card').filter({ hasText: ASSET_NAME });
    await expect(card).toBeVisible();
    await expect(card.getByText('Listed', { exact: true })).toBeVisible();
    await expect(card.getByText(`0 / ${FRACTIONS_COUNT}`)).toBeVisible();
    await expect(card.getByText('Raised')).toBeVisible();
    await expect(card.getByText('$0', { exact: true })).toBeVisible();
    await expect(card.getByRole('link', { name: 'Manage listing' })).toBeVisible();

    // Detailed breakdown table lists the asset too.
    await expect(
      page.getByRole('row').filter({ hasText: ASSET_NAME }).first(),
    ).toBeVisible();
  });

  test('updates the listing metadata and primary price', async ({ page, db }) => {
    test.setTimeout(150_000);

    await loginJourneyBusiness(page);
    await page.goto(bizUrl(`/asset/${nftId}/update`));
    await expect(page.getByRole('button', { name: 'Update the asset' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByLabel('Title')).toHaveValue(ASSET_NAME);

    await page.getByLabel('Description').fill(ASSET_DESCRIPTION_UPDATED);
    await page.getByLabel('Valuation (USD)').fill(UPDATED_VALUATION);
    await expect(page.getByLabel('Price per Fraction')).toHaveValue(String(UPDATED_PRICE));

    // updateListing on chain, then the updateListingPrice action records it.
    await page.getByRole('button', { name: 'Update the asset' }).click();
    await expect(page.getByText('Asset updated successfully!')).toBeVisible({
      timeout: 90_000,
    });

    const database = db();
    await pollUntil('the primary listing price to update', async () => {
      const result = await database
        .from('listings')
        .select('*')
        .eq('asset_id', assetId)
        .eq('kind', 'primary')
        .eq('status', 'active')
        .maybeSingle();
      expect(result.error).toBeNull();
      const row = result.data;
      return row && num(row.price_per_fraction) === UPDATED_PRICE ? row : null;
    });
    await pollUntil('the price_update transaction row', async () => {
      const result = await database
        .from('transactions')
        .select('*')
        .eq('asset_id', assetId)
        .eq('type', 'price_update')
        .maybeSingle();
      expect(result.error).toBeNull();
      return result.data;
    });
  });

  test('delists the remaining fractions', async ({ page, db }) => {
    test.setTimeout(150_000);

    await loginJourneyBusiness(page);
    await page.goto(bizUrl(`/asset/${nftId}/update`));
    await expect(
      page.getByRole('button', { name: 'Delist remaining fractions' }),
    ).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Delist remaining fractions' }).click();
    await expect(page.getByText('Delist the remaining fractions?')).toBeVisible();

    // unlistFractions on chain, then the cancelListing action records it.
    await page.getByRole('button', { name: 'Delist fractions' }).click();
    await expect(page.getByText('Remaining fractions delisted')).toBeVisible({
      timeout: 90_000,
    });

    const database = db();
    const canceled = await pollUntil('the canceled primary listing', async () => {
      const result = await database
        .from('listings')
        .select('*')
        .eq('asset_id', assetId)
        .eq('kind', 'primary')
        .eq('status', 'canceled')
        .maybeSingle();
      expect(result.error).toBeNull();
      return result.data;
    });
    expect(canceled.lister_id).toBe(userId);

    const asset = await pollUntil('the asset to be delisted', async () => {
      const result = await database
        .from('assets')
        .select('*')
        .eq('id', assetId)
        .maybeSingle();
      expect(result.error).toBeNull();
      return result.data && result.data.status === 'delisted' ? result.data : null;
    });
    expect(asset.status).toBe('delisted');

    await pollUntil('the unlist transaction row', async () => {
      const result = await database
        .from('transactions')
        .select('*')
        .eq('asset_id', assetId)
        .eq('type', 'unlist')
        .maybeSingle();
      expect(result.error).toBeNull();
      return result.data;
    });

    // The dashboard card reflects the delisted state.
    await page.goto(bizUrl('/dashboard'));
    const card = page.getByTestId('business-asset-card').filter({ hasText: ASSET_NAME });
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.getByText('Delisted', { exact: true })).toBeVisible();
  });

  test('shows transactions and revenue on the dashboard', async ({ page }) => {
    await loginJourneyBusiness(page);
    await page.goto(bizUrl('/dashboard'));

    // Revenue metrics render (zero sales for this run's asset, but visible).
    await expect(page.getByText('Total Raised Funds')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Fractions Sold')).toBeVisible();

    // The transaction history carries this run's full lifecycle.
    await expect(page.getByText('Transactions', { exact: true })).toBeVisible();
    const rowsFor = (typeLabel: string) =>
      page
        .getByRole('row')
        .filter({ hasText: ASSET_NAME })
        .filter({ hasText: typeLabel });
    await expect(rowsFor('Mint').first()).toBeVisible();
    await expect(rowsFor('Price update').first()).toBeVisible();
    await expect(rowsFor('Delisted').first()).toBeVisible();
  });

  test('persists settings updates', async ({ page, db }) => {
    const wallet = journeyWallet();
    const database = db();

    await loginJourneyBusiness(page);
    await page.goto(bizUrl('/settings'));

    const currencyInput = page.getByRole('combobox', { name: 'Currency' });
    await expect(currencyInput).toBeVisible({ timeout: 30_000 });

    // Pick a currency different from the current one so the change always
    // fires (re-entrant across runs: the previous run may have left any
    // supported value behind).
    const current = await currencyInput.inputValue();
    const nextCurrency = ['USD', 'AED', 'EUR'].find((option) => option !== current)!;
    await currencyInput.click();
    await page.getByRole('option', { name: nextCurrency }).click();
    await expect(page.getByTestId('business-settings-saved')).toBeVisible({
      timeout: 20_000,
    });

    await pollUntil(`settings.currency to become ${nextCurrency}`, async () => {
      const user = await database.userByWallet(wallet.address);
      return user && settingsOf(user).currency === nextCurrency ? user : null;
    });

    // Toggle a notification preference and wait for it to land.
    const securityCheckbox = page.getByTestId('business-pref-securityAlerts');
    const wasChecked = await securityCheckbox.locator('input').isChecked();
    await securityCheckbox.click();
    await pollUntil('the notification preference to persist', async () => {
      const user = await database.userByWallet(wallet.address);
      if (!user) {
        return null;
      }
      const preferences = settingsOf(user).preferences as
        | Record<string, boolean>
        | undefined;
      return preferences?.securityAlerts === !wasChecked ? user : null;
    });

    // Both changes survive a full reload (server-rendered from the row).
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Currency' })).toHaveValue(
      nextCurrency,
      { timeout: 30_000 },
    );
    await expect(
      page.getByTestId('business-pref-securityAlerts').locator('input'),
    ).toBeChecked({ checked: !wasChecked });
  });
});
