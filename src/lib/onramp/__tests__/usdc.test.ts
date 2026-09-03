/**
 * BigInt() calls instead of bigint literals: the tsconfig target is ES2017.
 */

import { addUsdc, microToUsdc, usdcToMicro } from '@/lib/onramp/usdc';

describe('usdcToMicro', () => {
  it('converts whole USDC amounts', () => {
    expect(usdcToMicro('1')).toBe(BigInt(1000000));
    expect(usdcToMicro('250')).toBe(BigInt(250000000));
    expect(usdcToMicro(3)).toBe(BigInt(3000000));
  });

  it('converts fractional USDC amounts', () => {
    expect(usdcToMicro('0.5')).toBe(BigInt(500000));
    expect(usdcToMicro('12.345678')).toBe(BigInt(12345678));
    expect(usdcToMicro('0.000001')).toBe(BigInt(1));
  });

  it('handles zero', () => {
    expect(usdcToMicro('0')).toBe(BigInt(0));
  });

  it('handles amounts beyond float precision', () => {
    expect(usdcToMicro('123456789012345678.123456')).toBe(
      BigInt('123456789012345678123456'),
    );
  });

  it('rejects negative amounts', () => {
    expect(() => usdcToMicro('-1')).toThrow('must not be negative');
  });

  it('rejects more than 6 decimal places', () => {
    expect(() => usdcToMicro('1.0000001')).toThrow('decimal places');
  });

  it('rejects non-numeric strings', () => {
    expect(() => usdcToMicro('12,50')).toThrow('Invalid numeric string');
    expect(() => usdcToMicro('abc')).toThrow('Invalid numeric string');
  });
});

describe('microToUsdc', () => {
  it('converts whole amounts without a decimal point', () => {
    expect(microToUsdc(BigInt(1000000))).toBe('1');
    expect(microToUsdc(BigInt(0))).toBe('0');
  });

  it('trims trailing zeros on fractional amounts', () => {
    expect(microToUsdc(BigInt(500000))).toBe('0.5');
    expect(microToUsdc(BigInt(12345678))).toBe('12.345678');
    expect(microToUsdc(BigInt(1))).toBe('0.000001');
  });

  it('rejects negative amounts', () => {
    expect(() => microToUsdc(BigInt(-1))).toThrow('must not be negative');
  });

  it('round-trips with usdcToMicro', () => {
    for (const amount of ['0', '1', '0.000001', '99.99', '123456.654321']) {
      expect(microToUsdc(usdcToMicro(amount))).toBe(amount);
    }
  });
});

describe('addUsdc', () => {
  it('sums amounts exactly', () => {
    expect(addUsdc('0.1', '0.2')).toBe('0.3');
    expect(addUsdc('99.999999', '0.000001')).toBe('100');
  });

  it('sums the order total and platform fee shape', () => {
    expect(addUsdc('1250.5', '31.2625')).toBe('1281.7625');
  });
});
