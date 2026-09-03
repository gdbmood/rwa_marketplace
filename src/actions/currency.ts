'use server';

import { serverEnv } from '@/lib/env';

/**
 * USD conversion rates for the currencies the UI can display. Plain shape
 * (not the ActionResult contract) because currencyStore consumes it directly.
 */
export type CurrencyRates = {
  USD: number;
  EUR: number;
  AED: number;
};

interface CachedRates {
  rates: CurrencyRates;
  refreshAfterUnix: number;
}

const FALLBACK_TTL_SECONDS = 60 * 60;

let cached: CachedRates | null = null;

/**
 * Fetches USD to EUR/AED rates from exchangerate-api.com (key from env, never
 * hardcoded), cached per server process until the provider's next update
 * time. A bad upstream response never poisons the cache: the previous good
 * rates are served while stale, and only a validated payload is stored.
 */
export async function currencyRate(): Promise<CurrencyRates> {
  if (process.env.TEST_MODE === '1') {
    // Test mode mocks every external provider (see e2e/README.md): fixed
    // rates, no network call, no EXCHANGE_RATE_API_KEY needed.
    return { USD: 1, EUR: 0.9, AED: 3.6725 };
  }

  const now = Math.floor(Date.now() / 1000);
  if (cached && now <= cached.refreshAfterUnix) {
    return cached.rates;
  }

  try {
    const apiKey = serverEnv.exchangeRateApiKey;
    const response = await fetch(
      `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`,
      { cache: 'no-store' },
    );
    if (!response.ok) {
      throw new Error(`Upstream responded ${response.status}`);
    }
    const data = (await response.json()) as {
      time_next_update_unix?: unknown;
      conversion_rates?: { EUR?: unknown; AED?: unknown };
    };
    const eur = data.conversion_rates?.EUR;
    const aed = data.conversion_rates?.AED;
    if (typeof eur !== 'number' || typeof aed !== 'number') {
      throw new Error('Upstream response missing conversion rates');
    }

    cached = {
      rates: { USD: 1, EUR: eur, AED: aed },
      refreshAfterUnix:
        typeof data.time_next_update_unix === 'number'
          ? data.time_next_update_unix
          : now + FALLBACK_TTL_SECONDS,
    };
    return cached.rates;
  } catch (error) {
    if (cached) {
      // Serve stale rates rather than breaking currency display.
      return cached.rates;
    }
    console.error('[currency.currencyRate]', error instanceof Error ? error.message : error);
    throw new Error('Failed to fetch currency rates');
  }
}
