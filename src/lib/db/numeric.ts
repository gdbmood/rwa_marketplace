/**
 * Postgres numeric columns cross the supabase-js wire as strings, while the
 * generated Database types declare them as number. These helpers are the
 * single conversion point for money values (numeric(38,6) USDC amounts).
 */

export type NumericInput = number | string;

const NUMERIC_PATTERN = /^-?\d+(\.\d+)?$/;

/** Max decimal places we ever send; matches numeric(38,6) money columns. */
const MONEY_SCALE = 6;

export function toNumericString(value: NumericInput): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid numeric value: ${value}`);
    }
    // toFixed avoids exponent notation, which Postgres numeric input rejects
    // from some client paths; trailing zeros are trimmed for readability.
    return trimTrailingZeros(value.toFixed(MONEY_SCALE));
  }
  const trimmed = value.trim();
  if (!NUMERIC_PATTERN.test(trimmed)) {
    throw new Error(`Invalid numeric string: "${value}"`);
  }
  return trimmed;
}

export function parseNumeric(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid numeric value: ${value}`);
    }
    return value;
  }
  const trimmed = value.trim();
  if (!NUMERIC_PATTERN.test(trimmed)) {
    throw new Error(`Invalid numeric string: "${value}"`);
  }
  return Number.parseFloat(trimmed);
}

/**
 * Cast helper for writes: the generated column type is number, but the wire
 * format is a string. This is the only sanctioned cast for that mismatch.
 */
export function numericColumn(value: NumericInput): number {
  return toNumericString(value) as unknown as number;
}

function trimTrailingZeros(fixed: string): string {
  if (!fixed.includes('.')) {
    return fixed;
  }
  return fixed.replace(/\.?0+$/, '');
}
