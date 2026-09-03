import {
  computePlatformFeeMicro,
  fromMicroUsdc,
  quoteFills,
  toMicroUsdc,
  type FillSource,
} from '@/actions/quote';

describe('toMicroUsdc', () => {
  it('parses whole and fractional USDC amounts', () => {
    expect(toMicroUsdc('1')).toBe(BigInt(1_000_000));
    expect(toMicroUsdc('0.000001')).toBe(BigInt(1));
    expect(toMicroUsdc('12.5')).toBe(BigInt(12_500_000));
    expect(toMicroUsdc('0')).toBe(BigInt(0));
  });

  it('parses numbers through toFixed without float drift', () => {
    expect(toMicroUsdc(0.1)).toBe(BigInt(100_000));
    expect(toMicroUsdc(19.99)).toBe(BigInt(19_990_000));
  });

  it('accepts trailing zero decimals beyond six places', () => {
    expect(toMicroUsdc('1.2500000000')).toBe(BigInt(1_250_000));
  });

  it('rejects non-zero digits beyond six decimal places', () => {
    expect(() => toMicroUsdc('1.0000001')).toThrow('more than 6 decimal places');
  });

  it('rejects malformed input', () => {
    expect(() => toMicroUsdc('abc')).toThrow('Invalid USDC amount');
    expect(() => toMicroUsdc('1.2.3')).toThrow('Invalid USDC amount');
    expect(() => toMicroUsdc('')).toThrow('Invalid USDC amount');
  });

  it('round-trips with fromMicroUsdc', () => {
    for (const value of ['0', '1', '0.25', '123456.789012']) {
      expect(fromMicroUsdc(toMicroUsdc(value))).toBe(value);
    }
  });
});

describe('fromMicroUsdc', () => {
  it('trims trailing zeros and handles negatives', () => {
    expect(fromMicroUsdc(BigInt(1_250_000))).toBe('1.25');
    expect(fromMicroUsdc(BigInt(1_000_000))).toBe('1');
    expect(fromMicroUsdc(BigInt(-500_000))).toBe('-0.5');
    expect(fromMicroUsdc(BigInt(0))).toBe('0');
  });
});

describe('computePlatformFeeMicro', () => {
  it('computes a basis point fee', () => {
    // 100 USDC at 25 bps = 0.25 USDC
    expect(computePlatformFeeMicro(BigInt(100_000_000), BigInt(25))).toBe(BigInt(250_000));
  });

  it('rounds half up to the nearest micro USDC', () => {
    // 1 micro at 25 bps = 0.0025 micro, rounds to 0
    expect(computePlatformFeeMicro(BigInt(1), BigInt(25))).toBe(BigInt(0));
    // 200 micro at 25 bps = 0.5 micro, rounds up to 1
    expect(computePlatformFeeMicro(BigInt(200), BigInt(25))).toBe(BigInt(1));
    // 199 micro at 25 bps = 0.4975 micro, rounds down to 0
    expect(computePlatformFeeMicro(BigInt(199), BigInt(25))).toBe(BigInt(0));
  });

  it('is zero for a zero fee rate', () => {
    expect(computePlatformFeeMicro(BigInt(100_000_000), BigInt(0))).toBe(BigInt(0));
  });

  it('rejects negative inputs', () => {
    expect(() => computePlatformFeeMicro(BigInt(-1), BigInt(25))).toThrow('must not be negative');
    expect(() => computePlatformFeeMicro(BigInt(1), BigInt(-1))).toThrow('must not be negative');
  });
});

describe('quoteFills', () => {
  const book: FillSource[] = [
    { listingId: 'l-mid', listerId: 'seller-b', availableQuantity: 50, pricePerFraction: '12' },
    { listingId: 'l-cheap', listerId: 'seller-a', availableQuantity: 30, pricePerFraction: '10' },
    { listingId: 'l-dear', listerId: 'seller-c', availableQuantity: 100, pricePerFraction: '15' },
  ];

  it('fills cheapest listings first', () => {
    const quote = quoteFills(book, 40);
    expect(quote.fills.map((fill) => fill.listingId)).toEqual(['l-cheap', 'l-mid']);
    expect(quote.fills[0]).toEqual({
      listingId: 'l-cheap',
      listerId: 'seller-a',
      quantity: 30,
      pricePerFraction: '10',
      subtotal: '300',
    });
    expect(quote.fills[1].quantity).toBe(10);
    expect(quote.filledQuantity).toBe(40);
    // 30 * 10 + 10 * 12 = 420
    expect(quote.total).toBe('420');
    expect(quote.totalMicro).toBe(BigInt(420_000_000));
  });

  it('consumes exactly one listing when it covers the quantity', () => {
    const quote = quoteFills(book, 30);
    expect(quote.fills).toHaveLength(1);
    expect(quote.fills[0].listingId).toBe('l-cheap');
    expect(quote.total).toBe('300');
  });

  it('reports a short fill instead of overselling', () => {
    const quote = quoteFills(book, 500);
    expect(quote.filledQuantity).toBe(180);
    expect(quote.fills).toHaveLength(3);
    // 30*10 + 50*12 + 100*15 = 2400
    expect(quote.total).toBe('2400');
  });

  it('preserves input order on price ties', () => {
    const tied: FillSource[] = [
      { listingId: 'first', listerId: 's1', availableQuantity: 5, pricePerFraction: '10' },
      { listingId: 'second', listerId: 's2', availableQuantity: 5, pricePerFraction: '10' },
    ];
    const quote = quoteFills(tied, 7);
    expect(quote.fills.map((fill) => fill.listingId)).toEqual(['first', 'second']);
    expect(quote.fills[1].quantity).toBe(2);
  });

  it('skips empty or invalid listings', () => {
    const quote = quoteFills(
      [
        { listingId: 'empty', listerId: 's1', availableQuantity: 0, pricePerFraction: '1' },
        { listingId: 'good', listerId: 's2', availableQuantity: 10, pricePerFraction: '2' },
      ],
      5,
    );
    expect(quote.fills.map((fill) => fill.listingId)).toEqual(['good']);
    expect(quote.total).toBe('10');
  });

  it('handles fractional prices without float error', () => {
    const quote = quoteFills(
      [{ listingId: 'frac', listerId: 's1', availableQuantity: 3, pricePerFraction: '0.1' }],
      3,
    );
    // 3 * 0.1 must be exactly 0.3, not 0.30000000000000004
    expect(quote.total).toBe('0.3');
    expect(quote.totalMicro).toBe(BigInt(300_000));
  });

  it('rejects a non-positive quantity', () => {
    expect(() => quoteFills(book, 0)).toThrow('Invalid quantity');
    expect(() => quoteFills(book, 1.5)).toThrow('Invalid quantity');
  });

  it('returns an empty quote for an empty book', () => {
    const quote = quoteFills([], 10);
    expect(quote.fills).toEqual([]);
    expect(quote.filledQuantity).toBe(0);
    expect(quote.total).toBe('0');
  });
});
