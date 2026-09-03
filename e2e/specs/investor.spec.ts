/**
 * Investor journeys, run serially against the orchestrated stack (local
 * hardhat chain, real indexer loop, remote Supabase, TEST_MODE providers).
 *
 * The file is one serial journey: test 00 mints a fresh, uniquely named
 * on-chain asset per run (plus a database-only asset priced to trip the mock
 * onramp's magic failing amount), and every later test asserts absolute
 * state scoped to those per-run assets, so accumulated data from earlier
 * runs never interferes. Serial mode restarts the worker on a retry, which
 * re-runs test 00 with a new run tag and fresh assets.
 *
 * Selector policy (same as the business spec): prefer user-visible text and
 * roles read from the actual components; data-testid only where the DOM
 * gives no stable handle (asset cards, filter checkboxes, holding cards,
 * settings preference toggles, test wallet login).
 */

import { expect, test } from '../fixtures';
import type { AssetRow } from '../../src/lib/db/assets';
import {
  FAIL_ASSET_NAME,
  MAIN_ASSET_NAME,
  MAIN_ASSET_SUPPLY,
  MAIN_DOC_GROUP,
  createCardFailAsset,
  holdingFor,
  latestOrderFor,
  listingsFor,
  mintInvestorAsset,
  num,
  onrampSessionForOrder,
  resetStaleChainState,
  settingsOf,
  transactionsFor,
  waitFor,
} from '../helpers/investor';

test.describe.configure({ mode: 'serial' });

const PROFILE_NAME = 'E2E Investor One';
const PROFILE_EMAIL = 'e2e-investor1@fractionnaire.test';
const PROFILE_PHONE = '+971500000001';

const RESALE_PRICE = '12.5';
const RESALE_PRICE_UPDATED = '15';

let mainAsset: AssetRow | undefined;
let failAsset: AssetRow | undefined;

function main(): AssetRow {
  if (!mainAsset) {
    throw new Error('Setup test did not run; the serial chain is broken.');
  }
  return mainAsset;
}

function cardFail(): AssetRow {
  if (!failAsset) {
    throw new Error('Setup test did not run; the serial chain is broken.');
  }
  return failAsset;
}

/**
 * Renders every holding card on the portfolio's performance tab. The page
 * paginates holdings 4 at a time behind a "View More" button and holdings
 * accumulate across runs in the shared remote database, so this run's asset
 * can start beyond the first page. Call after navigating to /portfolio and
 * before locating a holding card.
 */
async function revealAllHoldings(page: import('@playwright/test').Page): Promise<void> {
  await expect(
    page.getByTestId('portfolio-holding').first().or(page.getByText('No fractions yet')),
  ).toBeVisible({ timeout: 30_000 });
  const viewMore = page.getByRole('button', { name: 'View More' });
  for (let i = 0; i < 30 && (await viewMore.isVisible()); i += 1) {
    await viewMore.click();
  }
}

test.describe('investor journeys', () => {
  test('00 setup: stale-chain guard, on-chain mint, card-fail asset', async ({ db }) => {
    test.setTimeout(240_000);
    const service = db(); // fails fast with the SKIP message on a placeholder key

    // The remote database outlives the deterministic local chain; retire
    // rows that belong to a chain this node has never seen (see helper docs).
    await resetStaleChainState(service);

    mainAsset = await mintInvestorAsset();
    failAsset = await createCardFailAsset();

    expect(mainAsset.status).toBe('active');
    expect(mainAsset.kyc_required).toBe(true);
    expect(mainAsset.nft_id).not.toBeNull();
    expect(failAsset.status).toBe('active');
  });

  test('01 registers through test auth and completes the profile', async ({
    page,
    loginAs,
    db,
  }) => {
    const wallet = await loginAs(page, 'investor1');

    // Registration: the test-auth route upserts the users row on login.
    const user = await db().userByWallet(wallet.address);
    expect(user).not.toBeNull();
    expect(user!.type).toBe('retail');

    await page.goto('/profile');
    // exact: the "Edit account details" button substring-matches otherwise.
    // 60s: this is the run's first browser navigation, so it absorbs the
    // whole next-dev cold start (middleware + page compile + the very first
    // hydration of the 17k-module vendor bundle).
    await expect(page.getByText('Account details', { exact: true })).toBeVisible({
      timeout: 60_000,
    });
    // The session is visible in the UI (navbar shows the test wallet as logged in).
    await expect(page.getByTestId('test-wallet-logout')).toBeVisible();

    await page.getByRole('button', { name: 'Edit account details' }).click();
    await page.getByLabel('Full Name').fill(PROFILE_NAME);
    await page.getByLabel('Email').fill(PROFILE_EMAIL);
    await page.getByLabel('Phone Number').fill(PROFILE_PHONE);
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByRole('button', { name: 'Edit account details' })).toBeVisible();

    const updated = await db().userByWallet(wallet.address);
    expect(updated!.name).toBe(PROFILE_NAME);
    expect(updated!.email).toBe(PROFILE_EMAIL);
    expect(updated!.phone).toBe(PROFILE_PHONE);
  });

  test('02 browses the marketplace with search, class and field filters', async ({
    page,
    loginAs,
  }) => {
    const asset = main();
    await loginAs(page, 'investor1');
    await page.goto('/marketplace');

    const cards = page.getByTestId('marketplace-asset-card');
    const ourCard = cards.filter({ hasText: MAIN_ASSET_NAME });

    // Search narrows to the run's asset; the card carries the KYC badge.
    // 30s on the first assertion: first hit of /marketplace cold-compiles.
    await page.getByPlaceholder('Search for assets').fill(MAIN_ASSET_NAME);
    await expect(ourCard).toHaveCount(1, { timeout: 30_000 });
    await expect(ourCard.getByText('KYC required')).toBeVisible();
    await page.getByPlaceholder('Search for assets').fill('');

    // Class filter: the Falcons category chip.
    await page.getByRole('button', { name: 'Falcons', exact: true }).click();
    await expect(page).toHaveURL(/category=falcons/);
    await expect(ourCard).toHaveCount(1);

    // Per-class field filter: Breed. The wrong breed hides the asset...
    await page.getByRole('button', { name: 'Filter' }).click();
    await page.getByTestId('filter-option-Peregrine').click();
    await page.keyboard.press('Escape');
    await expect(ourCard).toHaveCount(0);

    // ...the right breed shows it (single-select per field, so this replaces).
    await page.getByRole('button', { name: 'Filter' }).click();
    await page.getByTestId('filter-option-Saker').click();
    await page.keyboard.press('Escape');
    await expect(ourCard).toHaveCount(1);

    // The card opens the asset detail page.
    await ourCard.click();
    await page.waitForURL(`**/asset/${asset.id}`);
  });

  test('03 opens the asset detail page and its documents', async ({ page, loginAs }) => {
    const asset = main();
    await loginAs(page, 'investor1');
    await page.goto(`/asset/${asset.id}`);

    await expect(page.getByText(MAIN_ASSET_NAME).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Details' })).toBeVisible();
    await expect(page.getByText('Breed', { exact: true })).toBeVisible();
    await expect(page.getByText('Saker', { exact: true })).toBeVisible();
    await expect(page.getByText('Total fractions')).toBeVisible();
    await expect(page.getByText(String(MAIN_ASSET_SUPPLY), { exact: true }).first()).toBeVisible();

    // Documents redirect box, then the docs page with the download link.
    await expect(page.getByText('1 document group')).toBeVisible();
    await page.getByText('Ownership documents').click();
    await page.waitForURL(`**/asset/${asset.id}/docs`);
    await expect(page.getByText(`${MAIN_ASSET_NAME}: documents`)).toBeVisible();
    await expect(page.getByText(MAIN_DOC_GROUP)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Download' })).toBeVisible();

    await page.getByRole('button', { name: 'Back to asset' }).click();
    await page.waitForURL(`**/asset/${asset.id}`);
  });

  test('04 KYC gate blocks an unverified buyer and lifts after the signed webhook', async ({
    page,
    request,
    loginAs,
    sumsubApprove,
    db,
  }) => {
    const asset = main();
    const wallet = await loginAs(page, 'investor1');

    // Force the unverified state (idempotent across runs): a signed RED review.
    await sumsubApprove(request, wallet.address, 'RED');
    expect((await db().userByWallet(wallet.address))!.is_verified).toBe(false);

    // Detail page: clear message, no buy controls.
    await page.goto(`/asset/${asset.id}`);
    await expect(
      page.getByText('This asset requires identity verification before buying.').first(),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Verify identity' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue to checkout' })).toHaveCount(0);

    // Checkout URL is gated the same way.
    await page.goto(`/asset/${asset.id}/buy/1`);
    await expect(
      page.getByText('This asset requires identity verification before buying.').first(),
    ).toBeVisible();
    await expect(page.getByRole('tab', { name: 'USDC' })).toHaveCount(0);

    // Approval arrives as a correctly signed Sumsub GREEN webhook.
    await sumsubApprove(request, wallet.address, 'GREEN');
    expect((await db().userByWallet(wallet.address))!.is_verified).toBe(true);

    // The gate is gone: the buy box renders and checkout shows payment tabs.
    await page.goto(`/asset/${asset.id}`);
    await expect(page.getByRole('heading', { name: 'Buy fractions' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue to checkout' }).click();
    await page.waitForURL(`**/asset/${asset.id}/buy/1`);
    await expect(page.getByRole('tab', { name: 'USDC' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Card' })).toBeVisible();
  });

  test('05 buys with USDC: approve, buyFractions, indexer settlement, portfolio', async ({
    page,
    loginAs,
    db,
  }) => {
    test.setTimeout(180_000);
    const asset = main();
    const wallet = await loginAs(page, 'investor1');
    const buyer = (await db().userByWallet(wallet.address))!;

    await page.goto(`/asset/${asset.id}/buy/3`);
    await page.getByRole('button', { name: 'Buy with USDC' }).click();

    // The test wallet signs approve + buyFractions without prompts; the order
    // then travels created -> submitted -> settled (indexer, 2s poll).
    await expect(page.getByText('Purchase complete')).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText(`3 fractions of ${MAIN_ASSET_NAME}`)).toBeVisible();

    const order = await latestOrderFor(db(), buyer.id, asset.id);
    expect(order).not.toBeNull();
    expect(order!.status).toBe('settled');
    expect(order!.quantity).toBe(3);
    expect(order!.payment_method).toBe('usdc');
    expect(order!.tx_hash).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(num(order!.quoted_total)).toBe(30);
    expect(num(order!.platform_fee)).toBeCloseTo(0.03, 6);

    // Ledger row written by the indexer from the FractionBought event.
    const buys = await transactionsFor(db(), asset.id, 'buy');
    const settledBuy = buys.find((tx) => tx.tx_hash === order!.tx_hash);
    expect(settledBuy).toBeTruthy();
    expect(settledBuy!.to_user_id).toBe(buyer.id);
    expect(settledBuy!.quantity).toBe(3);
    expect(num(settledBuy!.price_per_fraction)).toBe(10);

    // Holdings and the primary listing follow the chain.
    const holding = await holdingFor(db(), buyer.id, asset.id);
    expect(holding).not.toBeNull();
    expect(holding!.quantity).toBe(3);
    expect(num(holding!.average_entry_price)).toBe(10);
    const [primary] = await listingsFor(db(), asset.id, { kind: 'primary', status: 'active' });
    expect(primary.quantity).toBe(MAIN_ASSET_SUPPLY - 3);

    // Portfolio shows the holding with the average entry price.
    await page.getByRole('button', { name: 'Go to portfolio' }).click();
    await page.waitForURL('**/portfolio');
    await revealAllHoldings(page);
    const card = page.getByTestId('portfolio-holding').filter({ hasText: MAIN_ASSET_NAME });
    // 30s on the first assertion: first hit of /portfolio cold-compiles.
    await expect(card).toHaveCount(1, { timeout: 30_000 });
    await expect(card.getByText(`3 / ${MAIN_ASSET_SUPPLY}`)).toBeVisible();
    await expect(card.getByText('Average entry price')).toBeVisible();
    await expect(card.getByText('10 USDC')).toBeVisible();
  });

  test('06 buys with card through the mock onramp: awaiting_funds, funded, settled', async ({
    page,
    loginAs,
    db,
  }) => {
    test.setTimeout(180_000);
    const asset = main();
    const wallet = await loginAs(page, 'investor1');
    const buyer = (await db().userByWallet(wallet.address))!;

    await page.goto(`/asset/${asset.id}/buy/2`);
    await page.getByRole('tab', { name: 'Card' }).click();

    const popupPromise = page.context().waitForEvent('page');
    await page.getByRole('button', { name: 'Pay with card' }).click();

    // Order parked in awaiting_funds while the provider session is open.
    await expect(
      page.getByText('Complete the payment in the provider tab.'),
    ).toBeVisible({ timeout: 30_000 });
    const pending = await latestOrderFor(db(), buyer.id, asset.id);
    expect(pending!.status).toBe('awaiting_funds');
    expect(pending!.payment_method).toBe('onramp');

    // The mock provider page (TEST_MODE stand-in) completes the payment.
    const popup = await popupPromise;
    await popup.waitForLoadState();
    await expect(popup.getByText('Mock payment provider')).toBeVisible();
    await popup.getByRole('button', { name: 'Complete payment' }).click();
    // 30s: the click fires the first POST to /api/onramp/webhook, whose cold
    // compile in next dev queues behind the status route's compile.
    await expect(popup.getByText(/Payment completed/)).toBeVisible({ timeout: 30_000 });
    await popup.close();

    // funded -> the purchase executes automatically -> indexer settles.
    await expect(page.getByText('Purchase complete')).toBeVisible({ timeout: 120_000 });

    const order = await latestOrderFor(db(), buyer.id, asset.id);
    expect(order!.id).toBe(pending!.id);
    expect(order!.status).toBe('settled');
    expect(order!.quantity).toBe(2);
    expect(order!.tx_hash).toMatch(/^0x[0-9a-f]{64}$/i);

    const session = await onrampSessionForOrder(db(), order!.id);
    expect(session).not.toBeNull();
    expect(session!.provider).toBe('mock');
    expect(session!.status).toBe('completed');
    expect(num(session!.token_amount)).toBeCloseTo(20.02, 6);

    // The card deposit is on the ledger and the holding grew at the same price.
    const onramps = await transactionsFor(db(), asset.id, 'onramp');
    expect(onramps.some((tx) => tx.order_id === order!.id)).toBe(true);
    const holding = await holdingFor(db(), buyer.id, asset.id);
    expect(holding!.quantity).toBe(5);
    expect(num(holding!.average_entry_price)).toBe(10);
    const [primary] = await listingsFor(db(), asset.id, { kind: 'primary', status: 'active' });
    expect(primary.quantity).toBe(MAIN_ASSET_SUPPLY - 5);
  });

  test('07 card payment failure (magic 13) shows a clear failed state with retry', async ({
    page,
    loginAs,
    db,
  }) => {
    test.setTimeout(180_000);
    const asset = cardFail();
    const wallet = await loginAs(page, 'investor1');
    const buyer = (await db().userByWallet(wallet.address))!;

    await page.goto(`/asset/${asset.id}/buy/1`);
    await expect(page.getByText(FAIL_ASSET_NAME)).toBeVisible();
    await page.getByRole('tab', { name: 'Card' }).click();

    const popupPromise = page.context().waitForEvent('page');
    await page.getByRole('button', { name: 'Pay with card' }).click();

    // Leave the mock page untouched: the quote totals exactly 13 USDC, the
    // magic amount, so status polling walks created -> pending -> failed.
    const popup = await popupPromise;
    await popup.close();

    await expect(
      page.getByText('The card payment failed or was declined.'),
    ).toBeVisible({ timeout: 60_000 });

    const order = await latestOrderFor(db(), buyer.id, asset.id);
    expect(order!.status).toBe('failed');
    expect(order!.failure_reason).toBe('onramp_failed');
    const session = await onrampSessionForOrder(db(), order!.id);
    expect(session!.status).toBe('failed');
    expect(num(session!.fiat_amount)).toBe(13);
    expect(num(session!.token_amount)).toBe(13);

    // Retry resets the checkout to a fresh attempt.
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('button', { name: 'Pay with card' })).toBeVisible();
  });

  test('08 lists fractions for resale and the secondary listing appears', async ({
    page,
    loginAs,
    db,
  }) => {
    test.setTimeout(180_000);
    const asset = main();
    const wallet = await loginAs(page, 'investor1');
    const seller = (await db().userByWallet(wallet.address))!;

    await page.goto('/portfolio');
    await revealAllHoldings(page);
    const card = page.getByTestId('portfolio-holding').filter({ hasText: MAIN_ASSET_NAME });
    await card.getByRole('button', { name: 'Sell', exact: true }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Sell fractions')).toBeVisible();
    await dialog.getByLabel('Price per fraction (USDC)').fill(RESALE_PRICE);
    await dialog.getByRole('button', { name: 'List for sale' }).click();
    // approve + sellFractions on chain, then recordSecondaryListing.
    await expect(dialog.getByText('Listing created')).toBeVisible({ timeout: 60_000 });
    await dialog.getByRole('button', { name: 'Done' }).click();

    const [listing] = await listingsFor(db(), asset.id, {
      kind: 'secondary',
      listerId: seller.id,
      status: 'active',
    });
    expect(listing).toBeTruthy();
    expect(listing.quantity).toBe(1);
    expect(num(listing.price_per_fraction)).toBe(12.5);
    expect(listing.tx_hash).toMatch(/^0x[0-9a-f]{64}$/i);

    // Listed fractions are locked on the holding.
    const holding = await holdingFor(db(), seller.id, asset.id);
    expect(holding!.locked_quantity).toBe(1);

    // The open listing shows on the holding card after the refresh.
    await expect(
      card.getByText(`1 fraction at ${RESALE_PRICE} USDC`),
    ).toBeVisible({ timeout: 15_000 });

    // And buyers see the resale row on the asset detail page.
    await page.goto(`/asset/${asset.id}`);
    const resaleRow = page.getByRole('row').filter({ hasText: 'Resale' });
    await expect(resaleRow).toHaveCount(1);
    await expect(resaleRow.getByText(RESALE_PRICE)).toBeVisible();
  });

  test('09 updates the resale listing price', async ({ page, loginAs, db }) => {
    test.setTimeout(180_000);
    const asset = main();
    const wallet = await loginAs(page, 'investor1');
    const seller = (await db().userByWallet(wallet.address))!;

    await page.goto('/portfolio');
    await revealAllHoldings(page);
    const card = page.getByTestId('portfolio-holding').filter({ hasText: MAIN_ASSET_NAME });
    await card.getByRole('button', { name: 'Update price' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('New price per fraction (USDC)').fill(RESALE_PRICE_UPDATED);
    // Two chain confirmations: unlist at the old price, relist at the new one.
    await dialog.getByRole('button', { name: 'Update price' }).click();
    await expect(dialog.getByText('Price updated')).toBeVisible({ timeout: 60_000 });
    await dialog.getByRole('button', { name: 'Done' }).click();

    const [listing] = await listingsFor(db(), asset.id, {
      kind: 'secondary',
      listerId: seller.id,
      status: 'active',
    });
    expect(num(listing.price_per_fraction)).toBe(15);

    await page.goto(`/asset/${asset.id}`);
    const resaleRow = page.getByRole('row').filter({ hasText: 'Resale' });
    await expect(resaleRow.getByText(RESALE_PRICE_UPDATED, { exact: true })).toBeVisible();
  });

  test('10 unlists the resale listing', async ({ page, loginAs, db }) => {
    test.setTimeout(180_000);
    const asset = main();
    const wallet = await loginAs(page, 'investor1');
    const seller = (await db().userByWallet(wallet.address))!;

    await page.goto('/portfolio');
    await revealAllHoldings(page);
    const card = page.getByTestId('portfolio-holding').filter({ hasText: MAIN_ASSET_NAME });
    await card.getByRole('button', { name: 'Unlist' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Unlist fractions')).toBeVisible();
    await dialog.getByRole('button', { name: 'Unlist' }).click();
    await expect(dialog.getByText('Listing removed')).toBeVisible({ timeout: 60_000 });
    await dialog.getByRole('button', { name: 'Done' }).click();

    const active = await listingsFor(db(), asset.id, {
      kind: 'secondary',
      listerId: seller.id,
      status: 'active',
    });
    expect(active).toHaveLength(0);
    const canceled = await listingsFor(db(), asset.id, {
      kind: 'secondary',
      listerId: seller.id,
      status: 'canceled',
    });
    expect(canceled.length).toBeGreaterThanOrEqual(1);

    // The lock is released and the detail page no longer offers the resale.
    const holding = await holdingFor(db(), seller.id, asset.id);
    expect(holding!.locked_quantity).toBe(0);
    await page.goto(`/asset/${asset.id}`);
    await expect(page.getByRole('row').filter({ hasText: 'Resale' })).toHaveCount(0);
  });

  test('11 transfers fractions to another user and the indexer moves balances', async ({
    page,
    loginAs,
    walletFor,
    db,
  }) => {
    test.setTimeout(180_000);
    const asset = main();
    const wallet = await loginAs(page, 'investor1');
    const sender = (await db().userByWallet(wallet.address))!;
    const recipientWallet = walletFor('investor2');
    const recipient = (await db().userByWallet(recipientWallet.address))!;

    await page.goto('/portfolio');
    await revealAllHoldings(page);
    const card = page.getByTestId('portfolio-holding').filter({ hasText: MAIN_ASSET_NAME });
    await card.getByRole('button', { name: 'Send fractions' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Recipient wallet address').fill(recipientWallet.address);
    await dialog.getByRole('button', { name: 'Send', exact: true }).click();
    // Plain ERC20 transfer signed by the test wallet; recordTransfer waits
    // for the indexer's authoritative ledger row before returning.
    await expect(dialog.getByText('Fractions sent')).toBeVisible({ timeout: 60_000 });
    await dialog.getByRole('button', { name: 'Done' }).click();

    // The indexer moved both balances.
    await waitFor(
      async () => {
        const senderHolding = await holdingFor(db(), sender.id, asset.id);
        const recipientHolding = await holdingFor(db(), recipient.id, asset.id);
        return senderHolding?.quantity === 4 && recipientHolding?.quantity === 1;
      },
      { timeoutMs: 45_000, intervalMs: 1_500, label: 'indexer to move transfer balances' },
    );

    const transfers = await transactionsFor(db(), asset.id, 'transfer');
    const transfer = transfers.find(
      (tx) => tx.from_user_id === sender.id && tx.to_user_id === recipient.id,
    );
    expect(transfer).toBeTruthy();
    expect(transfer!.quantity).toBe(1);
    expect(transfer!.tx_hash).toMatch(/^0x[0-9a-f]{64}$/i);
  });

  test('12 the recipient sees the transferred fractions in their portfolio', async ({
    page,
    loginAs,
  }) => {
    await loginAs(page, 'investor2');
    await page.goto('/portfolio');

    await revealAllHoldings(page);
    const card = page.getByTestId('portfolio-holding').filter({ hasText: MAIN_ASSET_NAME });
    await expect(card).toHaveCount(1);
    await expect(card.getByText(`1 / ${MAIN_ASSET_SUPPLY}`)).toBeVisible();

    // The transfer shows in the recipient's history as Received.
    await page.getByRole('tab', { name: 'Trading history' }).click();
    const row = page
      .getByRole('row')
      .filter({ hasText: MAIN_ASSET_NAME })
      .filter({ has: page.getByRole('cell', { name: 'Received', exact: true }) });
    await expect(row.first()).toBeVisible();
  });

  test('13 transaction history lists every operation of the journey', async ({
    page,
    loginAs,
  }) => {
    await loginAs(page, 'investor1');
    await page.goto('/portfolio');
    await page.getByRole('tab', { name: 'Trading history' }).click();

    const assetRows = page.getByRole('row').filter({ hasText: MAIN_ASSET_NAME });
    // Purchases (USDC and card), the card deposit, the listing lifecycle and
    // the outgoing transfer, all labeled from the caller's point of view.
    // Exact cell matches keep "Listed" from matching the "Unlisted" row.
    for (const label of [
      'Purchase',
      'Card deposit',
      'Listed',
      'Price update',
      'Unlisted',
      'Sent',
    ]) {
      await expect(
        assetRows
          .filter({ has: page.getByRole('cell', { name: label, exact: true }) })
          .first(),
        `history should list a "${label}" entry for ${MAIN_ASSET_NAME}`,
      ).toBeVisible();
    }
  });

  test('14 display currency changes the prices shown', async ({ page, loginAs, db }) => {
    const asset = main();
    const wallet = await loginAs(page, 'investor1');

    await page.goto('/settings');
    await page.getByRole('combobox', { name: 'Currency' }).click();
    await page.getByRole('combobox', { name: 'Currency' }).press('ArrowDown'); // guarantees the listbox is open
    await page.getByRole('option', { name: 'AED' }).click();
    await waitFor(
      async () => {
        const user = await db().userByWallet(wallet.address);
        return user !== null && settingsOf(user).currency === 'AED';
      },
      { timeoutMs: 15_000, intervalMs: 500, label: 'currency AED persisted to settings' },
    );

    // Converted amounts across the app now render in AED.
    await page.goto(`/asset/${asset.id}`);
    await expect(page.getByText(/\bAED\b/).first()).toBeVisible();
    await page.goto('/portfolio');
    await expect(page.getByText(/\bAED\b/).first()).toBeVisible();

    // Restore USD so the rest of the suite (and future runs) see the default.
    await page.goto('/settings');
    await page.getByRole('combobox', { name: 'Currency' }).click();
    await page.getByRole('combobox', { name: 'Currency' }).press('ArrowDown');
    await page.getByRole('option', { name: 'USD' }).click();
    await waitFor(
      async () => {
        const user = await db().userByWallet(wallet.address);
        return user !== null && settingsOf(user).currency === 'USD';
      },
      { timeoutMs: 15_000, intervalMs: 500, label: 'currency USD persisted to settings' },
    );
  });

  test('15 settings preferences persist through the server action', async ({
    page,
    loginAs,
    db,
  }) => {
    const wallet = await loginAs(page, 'investor1');
    await page.goto('/settings');

    const toggle = page.getByTestId('pref-investmentUpdates');
    const input = toggle.getByRole('checkbox');
    await expect(input).toBeVisible();
    // Start from whatever a previous (possibly crashed) run left behind.
    const initiallyChecked = await input.isChecked();

    const expectStoredValue = (value: boolean, label: string) =>
      waitFor(
        async () => {
          const user = await db().userByWallet(wallet.address);
          if (!user) {
            return false;
          }
          const preferences = settingsOf(user).preferences as
            | Record<string, unknown>
            | undefined;
          return preferences?.investmentUpdates === value;
        },
        { timeoutMs: 15_000, intervalMs: 500, label },
      );

    await toggle.click();
    await expectStoredValue(!initiallyChecked, 'preference toggle persisted (flipped)');

    // The stored value survives a full reload.
    await page.reload();
    await expect(toggle.getByRole('checkbox')).toBeChecked({ checked: !initiallyChecked });

    // Flip back so the journey leaves the account as it found it.
    await toggle.click();
    await expectStoredValue(initiallyChecked, 'preference toggle persisted (restored)');
    await expect(toggle.getByRole('checkbox')).toBeChecked({ checked: initiallyChecked });
  });

  test('16 logs out and back in with state intact', async ({ page, loginAs }) => {
    await loginAs(page, 'investor1');

    await page.goto('/profile');
    await expect(page.getByLabel('Full Name')).toHaveValue(PROFILE_NAME);

    // Logout goes through the confirmation modal (background is aria-hidden,
    // so the role query resolves to the modal's own button).
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await expect(page.getByText('Are you sure you want to log out?')).toBeVisible();
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await page.waitForURL((url) => url.pathname === '/');

    // The session is gone: the portfolio shows its auth gate.
    await page.goto('/portfolio');
    await expect(
      page.getByText('Connect your wallet to see your portfolio'),
    ).toBeVisible();

    // Log back in through the test-mode navbar button (the e2e_pk key is
    // still in localStorage, exactly like a returning user).
    await page.getByTestId('test-wallet-login').click();
    await expect(page.getByTestId('test-wallet-logout')).toBeVisible();
    await page.reload();

    // State intact: holdings and profile survived the logout.
    await revealAllHoldings(page);
    const card = page.getByTestId('portfolio-holding').filter({ hasText: MAIN_ASSET_NAME });
    await expect(card).toHaveCount(1);
    await expect(card.getByText(`4 / ${MAIN_ASSET_SUPPLY}`)).toBeVisible();
    await page.goto('/profile');
    await expect(page.getByLabel('Full Name')).toHaveValue(PROFILE_NAME);
  });
});
