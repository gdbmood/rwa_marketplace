// src/utils/__tests__/formatNumberForDisplay.test.ts
import formatNumberForDisplay from '../formatNumberForDisplay';

describe('formatNumberForDisplay', () => {
    describe('small numbers (< 1000)', () => {
        it('should format numbers less than 1000 with 2 decimal places', () => {
            expect(formatNumberForDisplay(123.456)).toBe('123.46');
            expect(formatNumberForDisplay(0)).toBe('0.00');
            expect(formatNumberForDisplay(1)).toBe('1.00');
            expect(formatNumberForDisplay(999.99)).toBe('999.99');
        });

        it('should handle negative numbers', () => {
            expect(formatNumberForDisplay(-123.456)).toBe('123.46');
            expect(formatNumberForDisplay(-999.99)).toBe('999.99');
        });
    });

    describe('thousands (K)', () => {
        it('should format thousands with K suffix', () => {
            expect(formatNumberForDisplay(1000)).toBe('1.00K');
            expect(formatNumberForDisplay(1500)).toBe('1.50K');
            expect(formatNumberForDisplay(999000)).toBe('999.00K');
        });
    });

    describe('millions (M)', () => {
        it('should format millions with M suffix', () => {
            expect(formatNumberForDisplay(1000000)).toBe('1.00M');
            expect(formatNumberForDisplay(1500000)).toBe('1.50M');
            expect(formatNumberForDisplay(999000000)).toBe('999.00M');
        });
    });

    describe('billions (B)', () => {
        it('should format billions with B suffix', () => {
            expect(formatNumberForDisplay(1000000000)).toBe('1.00B');
            expect(formatNumberForDisplay(1500000000)).toBe('1.50B');
            expect(formatNumberForDisplay(999000000000)).toBe('999.00B');
        });
    });

    describe('trillions (T)', () => {
        it('should format trillions with T suffix', () => {
            expect(formatNumberForDisplay(1000000000000)).toBe('1.00T');
            expect(formatNumberForDisplay(1500000000000)).toBe('1.50T');
            expect(formatNumberForDisplay(999000000000000)).toBe('999.00T');
        });
    });

    describe('very large numbers', () => {
        it('should format very large numbers with T suffix', () => {
            expect(formatNumberForDisplay(1e15)).toBe('1000.00T');
            expect(formatNumberForDisplay(1.23e16)).toBe('12300.00T');
        });

        it('should use exponential notation for extremely large numbers', () => {
            expect(formatNumberForDisplay(1e20)).toBe('100000000.00T');
        });
    });

    describe('edge cases', () => {
        it('should handle decimal numbers correctly', () => {
            expect(formatNumberForDisplay(1234.56)).toBe('1.23K');
            expect(formatNumberForDisplay(1234567.89)).toBe('1.23M');
        });

        it('should round properly', () => {
            expect(formatNumberForDisplay(1234.999)).toBe('1.23K');
            expect(formatNumberForDisplay(1999)).toBe('2.00K');
        });
    });
});
