import {
  cleanString,
  isPositiveInteger,
  isTxHash,
  isUuid,
  isWalletAddress,
} from '@/actions/validate';

describe('isTxHash', () => {
  it('accepts a 32 byte hex hash', () => {
    expect(isTxHash(`0x${'ab'.repeat(32)}`)).toBe(true);
  });

  it('rejects wrong lengths, missing prefix and non-strings', () => {
    expect(isTxHash(`0x${'ab'.repeat(31)}`)).toBe(false);
    expect(isTxHash('ab'.repeat(32))).toBe(false);
    expect(isTxHash(`0x${'zz'.repeat(32)}`)).toBe(false);
    expect(isTxHash(42)).toBe(false);
    expect(isTxHash(undefined)).toBe(false);
  });
});

describe('isWalletAddress', () => {
  it('accepts a 20 byte hex address in any case', () => {
    expect(isWalletAddress('0x511B10f9fD7d95738E372757EF85FB8a0c290f0E')).toBe(true);
    expect(isWalletAddress(`0x${'0'.repeat(40)}`)).toBe(true);
  });

  it('rejects malformed addresses', () => {
    expect(isWalletAddress('0x123')).toBe(false);
    expect(isWalletAddress(`0x${'g'.repeat(40)}`)).toBe(false);
    expect(isWalletAddress(null)).toBe(false);
  });
});

describe('isUuid', () => {
  it('accepts uuid strings', () => {
    expect(isUuid('9b2e6c1a-4f3d-4a2b-8c1d-0e9f8a7b6c5d')).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('9b2e6c1a4f3d4a2b8c1d0e9f8a7b6c5d')).toBe(false);
    expect(isUuid(7)).toBe(false);
  });
});

describe('isPositiveInteger', () => {
  it('accepts positive integers only', () => {
    expect(isPositiveInteger(1)).toBe(true);
    expect(isPositiveInteger(10_000)).toBe(true);
    expect(isPositiveInteger(0)).toBe(false);
    expect(isPositiveInteger(-3)).toBe(false);
    expect(isPositiveInteger(1.5)).toBe(false);
    expect(isPositiveInteger('1')).toBe(false);
    expect(isPositiveInteger(Number.NaN)).toBe(false);
  });
});

describe('cleanString', () => {
  it('trims and returns the value within the cap', () => {
    expect(cleanString('  hello  ', 10)).toBe('hello');
  });

  it('rejects empty, oversized and non-string values', () => {
    expect(cleanString('   ', 10)).toBeNull();
    expect(cleanString('a'.repeat(11), 10)).toBeNull();
    expect(cleanString(123, 10)).toBeNull();
  });
});
