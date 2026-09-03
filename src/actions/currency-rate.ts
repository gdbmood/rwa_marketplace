'use server';

import { type CurrencyRates, currencyRate as fetchCurrencyRates } from '@/actions/currency';

/**
 * Back-compat wrapper: currencyStore imports from '@/actions/currency-rate'.
 * The implementation (env API key, validated cache) lives in
 * src/actions/currency.ts. Point new code there.
 */
export async function currencyRate(): Promise<CurrencyRates> {
  return fetchCurrencyRates();
}
