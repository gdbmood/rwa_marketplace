/**
 * Pure money math for order quoting. Prices cross the wire as numeric strings
 * in USDC units (6 decimals max); all arithmetic here happens in integer
 * micro USDC (bigint) so no floating point error can reach the database.
 * No server imports so the logic stays unit-testable.
 */

// BigInt() calls instead of literals: the tsconfig targets ES2017 and bigint
// literals need ES2020, while the BigInt runtime is available everywhere the
// app runs.
const ZERO = BigInt(0);
const MICRO_PER_USDC = BigInt(1_000_000);
const FEE_BPS_DENOMINATOR = BigInt(10_000);
const HALF_FEE_DENOMINATOR = BigInt(5_000);

/** Parses a USDC amount (decimal string or number) into micro USDC. */
export function toMicroUsdc(value: string | number): bigint {
  const str = typeof value === 'number' ? value.toFixed(6) : String(value).trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(str);
  if (!match) {
    throw new Error(`Invalid USDC amount: "${value}"`);
  }
  const [, sign, whole, fraction = ''] = match;
  if (fraction.length > 6 && /[^0]/.test(fraction.slice(6))) {
    throw new Error(`USDC amount has more than 6 decimal places: "${value}"`);
  }
  const micro =
    BigInt(whole) * MICRO_PER_USDC + BigInt(fraction.slice(0, 6).padEnd(6, '0'));
  return sign === '-' ? -micro : micro;
}

/** Formats micro USDC back into a decimal string in USDC units. */
export function fromMicroUsdc(micro: bigint): string {
  const negative = micro < ZERO;
  const abs = negative ? -micro : micro;
  const whole = abs / MICRO_PER_USDC;
  const fraction = (abs % MICRO_PER_USDC).toString().padStart(6, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

/**
 * Platform fee in micro USDC from a total in micro USDC and a fee in basis
 * points (the chain's platformFee(), e.g. 25 = 0.25 percent). Rounds half up
 * to the nearest micro USDC, matching the display rounding on the buy pages.
 */
export function computePlatformFeeMicro(totalMicro: bigint, feeBps: bigint): bigint {
  if (totalMicro < ZERO) {
    throw new Error(`Fee base must not be negative: ${totalMicro}`);
  }
  if (feeBps < ZERO) {
    throw new Error(`Fee bps must not be negative: ${feeBps}`);
  }
  return (totalMicro * feeBps + HALF_FEE_DENOMINATOR) / FEE_BPS_DENOMINATOR;
}

export interface FillSource {
  listingId: string;
  listerId: string;
  /** Fractions still available on the listing. */
  availableQuantity: number;
  /** Price per fraction in USDC units (numeric string or number). */
  pricePerFraction: string | number;
}

export interface QuotedFill {
  listingId: string;
  listerId: string;
  quantity: number;
  /** Price per fraction in USDC units, normalized decimal string. */
  pricePerFraction: string;
  /** quantity * pricePerFraction in USDC units, normalized decimal string. */
  subtotal: string;
}

export interface FillQuote {
  fills: QuotedFill[];
  /** Fractions actually covered by the fills. Less than requested when the book is short. */
  filledQuantity: number;
  totalMicro: bigint;
  /** Total in USDC units, normalized decimal string. */
  total: string;
}

/**
 * Quotes fills for a buy order, cheapest listings first (ties broken by input
 * order, which the repository sorts by creation time). The caller must treat
 * filledQuantity < quantity as an insufficient-liquidity conflict.
 */
export function quoteFills(sources: FillSource[], quantity: number): FillQuote {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error(`Invalid quantity to quote: ${quantity}`);
  }

  const priced = sources
    .filter((source) => Number.isInteger(source.availableQuantity) && source.availableQuantity > 0)
    .map((source, index) => ({ source, index, priceMicro: toMicroUsdc(source.pricePerFraction) }))
    .sort((a, b) => {
      if (a.priceMicro !== b.priceMicro) {
        return a.priceMicro < b.priceMicro ? -1 : 1;
      }
      return a.index - b.index;
    });

  const fills: QuotedFill[] = [];
  let remaining = quantity;
  let totalMicro = ZERO;

  for (const { source, priceMicro } of priced) {
    if (remaining <= 0) {
      break;
    }
    const take = Math.min(remaining, source.availableQuantity);
    const subtotalMicro = priceMicro * BigInt(take);
    fills.push({
      listingId: source.listingId,
      listerId: source.listerId,
      quantity: take,
      pricePerFraction: fromMicroUsdc(priceMicro),
      subtotal: fromMicroUsdc(subtotalMicro),
    });
    totalMicro += subtotalMicro;
    remaining -= take;
  }

  return {
    fills,
    filledQuantity: quantity - remaining,
    totalMicro,
    total: fromMicroUsdc(totalMicro),
  };
}
