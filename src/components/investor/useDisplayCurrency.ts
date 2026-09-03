'use client';

import { useEffect, useState } from 'react';
import { currencyRate } from '@/actions/currency';
import { getMyProfile } from '@/actions/profile';
import { formatFiat, parseAmount } from '@/components/investor/format';

export interface DisplayCurrency {
  /** ISO code the user chose in settings; USD until the profile loads. */
  currency: string;
  /** USD to display-currency conversion rate; 1 until rates load. */
  rate: number;
  /** True once both the rate and the profile lookups finished (or failed). */
  ready: boolean;
  /** Converts a USDC amount (string or number) into a formatted fiat string. */
  convert: (usdcAmount: number | string | null | undefined) => string;
}

/**
 * Resolves the viewer's display currency (from their settings, defaulting to
 * USD) and the USD conversion rate via the currency server action. Fails
 * quietly to USD at rate 1: currency display must never block a screen.
 */
export function useDisplayCurrency(): DisplayCurrency {
  const [currency, setCurrency] = useState('USD');
  const [rates, setRates] = useState<Record<string, number>>({ USD: 1 });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([currencyRate(), getMyProfile()]).then(
      ([ratesResult, profileResult]) => {
        if (cancelled) {
          return;
        }
        if (ratesResult.status === 'fulfilled') {
          setRates(ratesResult.value);
        }
        if (profileResult.status === 'fulfilled' && profileResult.value.ok) {
          const settings = profileResult.value.data.settings;
          if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
            const chosen = (settings as Record<string, unknown>).currency;
            if (typeof chosen === 'string' && chosen) {
              setCurrency(chosen);
            }
          }
        }
        setReady(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const rate = rates[currency] ?? 1;

  return {
    currency,
    rate,
    ready,
    convert: (usdcAmount) => formatFiat(parseAmount(usdcAmount) * rate),
  };
}
