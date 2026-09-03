/**
 * Conversions between database USDC amounts (numeric strings in USDC units)
 * and on-chain amounts (bigint micro USDC, 6 decimals). Builds on the
 * sanctioned numeric helpers so validation stays in one place.
 *
 * BigInt() calls are used instead of bigint literals because the tsconfig
 * target is ES2017.
 */

import { type NumericInput, toNumericString } from '@/lib/db/numeric';

export const USDC_DECIMALS = 6;

const ZERO = BigInt(0);
const MICRO_PER_USDC = BigInt(10) ** BigInt(USDC_DECIMALS);

/** Converts a USDC-units amount (numeric string or number) to bigint micro USDC. */
export function usdcToMicro(value: NumericInput): bigint {
  const normalized = toNumericString(value);
  if (normalized.startsWith('-')) {
    throw new Error(`USDC amount must not be negative: "${normalized}"`);
  }
  const [whole, fraction = ''] = normalized.split('.');
  if (fraction.length > USDC_DECIMALS) {
    throw new Error(
      `USDC amount has more than ${USDC_DECIMALS} decimal places: "${normalized}"`,
    );
  }
  const paddedFraction = fraction.padEnd(USDC_DECIMALS, '0');
  return BigInt(whole) * MICRO_PER_USDC + BigInt(paddedFraction);
}

/** Converts bigint micro USDC to a numeric string in USDC units. */
export function microToUsdc(value: bigint): string {
  if (value < ZERO) {
    throw new Error(`Micro USDC amount must not be negative: ${value}`);
  }
  const whole = value / MICRO_PER_USDC;
  const fraction = value % MICRO_PER_USDC;
  if (fraction === ZERO) {
    return whole.toString();
  }
  const fractionDigits = fraction
    .toString()
    .padStart(USDC_DECIMALS, '0')
    .replace(/0+$/, '');
  return `${whole.toString()}.${fractionDigits}`;
}

/** Sums USDC-units amounts exactly, without floating point. */
export function addUsdc(...values: NumericInput[]): string {
  const total = values.reduce((sum, value) => sum + usdcToMicro(value), ZERO);
  return microToUsdc(total);
}
