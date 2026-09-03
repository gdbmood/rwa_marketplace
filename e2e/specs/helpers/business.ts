/**
 * Helpers for the business journey spec.
 *
 * The business pages live behind the business subdomain (src/middleware.ts
 * rewrites /dashboard, /list-new-asset, /verify-business, /profile and
 * /settings into the /business route group only when the first host label is
 * "business"). The spec therefore drives them on http://business.localhost:3100,
 * which Chromium resolves to loopback per RFC 6761. Session cookies are
 * host-scoped, so after the regular POST /api/test-auth against the main
 * origin the JWT cookie is cloned onto the business origin.
 *
 * The journey uses hardhat account 6: a funded chain account (FUND_ACCOUNTS
 * defaults to 10 in contracts/scripts/deploy_local.ts) that is deliberately
 * NOT in the seed roster (e2e/wallets.ts stops at index 5), so the very first
 * POST /api/test-auth in a run truly exercises registration (users row
 * created on login) and the KYB flow starts unverified after the RED-webhook
 * reset. Seeded roles (business1, business2, investors) are untouched.
 */

import type { Page } from '@playwright/test';
import * as path from 'node:path';
import { APP_PORT, E2E_DIR, readChainJson } from '../../stack';
import { HARDHAT_ADDRESSES, WALLETS, WALLET_ROLES } from '../../wallets';

/** Hardhat account index for the journey business wallet (a spare account). */
export const JOURNEY_ACCOUNT_INDEX = 6;

export const MAIN_ORIGIN = `http://localhost:${APP_PORT}`;
export const BUSINESS_ORIGIN = `http://business.localhost:${APP_PORT}`;

export const SESSION_COOKIE_NAME = 'jwt';

/** localStorage key src/lib/wallet/testAccount.ts reads in test mode. */
const E2E_PK_STORAGE_KEY = 'e2e_pk';

export interface JourneyWallet {
  address: string;
  privateKey: string;
}

/** URL on the business subdomain (dashboard, listing, profile, settings). */
export function bizUrl(pathname: string): string {
  return `${BUSINESS_ORIGIN}${pathname}`;
}

/** URL on the main host (marketplace, asset detail). */
export function mainUrl(pathname: string): string {
  return `${MAIN_ORIGIN}${pathname}`;
}

/** Absolute path of a small upload fixture in e2e/fixtures-data/. */
export function fixtureFile(name: string): string {
  return path.join(E2E_DIR, 'fixtures-data', name);
}

/**
 * The journey wallet: chain account 6 from e2e/.chain.json. Guarded against
 * roster drift: it must exist (deploy funds 10 accounts) and must NOT be one
 * of the seeded role wallets, or the journey would trample seeded state.
 */
export function journeyWallet(): JourneyWallet {
  const chain = readChainJson();
  if (!chain) {
    throw new Error(
      'e2e/.chain.json is missing. Run the suite through `npm run e2e` so the deploy writes it.',
    );
  }
  const account = chain.accounts[JOURNEY_ACCOUNT_INDEX];
  if (!account) {
    throw new Error(
      `e2e/.chain.json has no funded account at index ${JOURNEY_ACCOUNT_INDEX}. ` +
        'Delete e2e/.chain.json and rerun so deploy_local.ts funds all 10 accounts.',
    );
  }
  const expected = HARDHAT_ADDRESSES[JOURNEY_ACCOUNT_INDEX];
  if (expected && account.address.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(
      `Chain account ${JOURNEY_ACCOUNT_INDEX} is ${account.address}, expected the standard ` +
        `hardhat account ${expected}. Delete e2e/.chain.json and redeploy.`,
    );
  }
  for (const role of WALLET_ROLES) {
    if (WALLETS[role].toLowerCase() === account.address.toLowerCase()) {
      throw new Error(
        `Journey wallet collides with seeded role "${role}" (${account.address}). ` +
          'Pick a spare hardhat account outside the seed roster.',
      );
    }
  }
  return { address: account.address, privateKey: account.privateKey };
}

/**
 * Logs the journey wallet in as a business:
 *   1. seeds localStorage e2e_pk on every navigation (any origin), so the
 *      app's test-mode signer finds the key,
 *   2. POSTs /api/test-auth on the main origin (creates the users row on the
 *      first ever login and sets the session cookie for localhost),
 *   3. clones the host-scoped session cookie onto business.localhost so the
 *      business subdomain pages see the same session.
 */
export async function loginJourneyBusiness(page: Page): Promise<JourneyWallet> {
  const wallet = journeyWallet();

  await page.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // about:blank has no storage; the script reruns on real navigations.
      }
    },
    [E2E_PK_STORAGE_KEY, wallet.privateKey] as const,
  );

  const response = await page.context().request.post(`${MAIN_ORIGIN}/api/test-auth`, {
    data: { wallet: wallet.address, type: 'business' },
  });
  if (!response.ok()) {
    const body = await response.text();
    throw new Error(
      `POST /api/test-auth failed (${response.status()}): ${body}. ` +
        'Is the app running with TEST_MODE=1?',
    );
  }

  const cookies = await page.context().cookies(MAIN_ORIGIN);
  const session = cookies.find((cookie) => cookie.name === SESSION_COOKIE_NAME);
  if (!session) {
    throw new Error('test-auth responded ok but set no session cookie');
  }
  await page.context().addCookies([
    {
      name: session.name,
      value: session.value,
      url: BUSINESS_ORIGIN,
      httpOnly: session.httpOnly,
      secure: session.secure,
      sameSite: session.sameSite,
      expires: session.expires,
    },
  ]);

  return wallet;
}

/**
 * Polls an async producer until it returns a non-null value. For database
 * state written asynchronously by the indexer (listing rows, transactions)
 * where the UI signal can slightly precede the row.
 */
export async function pollUntil<T>(
  label: string,
  producer: () => Promise<T | null | undefined>,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 20_000;
  const intervalMs = options.intervalMs ?? 500;
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;
  for (;;) {
    try {
      const value = await producer();
      if (value !== null && value !== undefined) {
        return value;
      }
    } catch (error) {
      lastError = error;
    }
    if (Date.now() >= deadline) {
      const suffix =
        lastError instanceof Error ? ` (last error: ${lastError.message})` : '';
      throw new Error(`Timed out after ${timeoutMs}ms waiting for ${label}${suffix}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** Coerces a Supabase numeric (number or numeric string) for assertions. */
export function num(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** The settings JSON of a users row as a plain record (empty when not set). */
export function settingsOf(user: { settings: unknown }): Record<string, unknown> {
  const { settings } = user;
  if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
    return settings as Record<string, unknown>;
  }
  return {};
}

/** The metadata JSON of an assets row as a plain record. */
export function metadataOf(asset: { metadata: unknown }): Record<string, unknown> {
  const { metadata } = asset;
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }
  return {};
}
