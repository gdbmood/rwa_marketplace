// src/store/__tests__/currencyStore.test.ts
import { act } from '@testing-library/react';
import currencyStore from '../currencyStore';
import { currencyRate } from '@/actions/currency-rate';

// Mock currency rate action
jest.mock('@/actions/currency-rate', () => ({
    currencyRate: jest.fn(),
}));

describe('currencyStore', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset store state
        currencyStore.getState().setCurrencies({});
    });

    describe('initial state', () => {
        it('should have empty currencies object initially', () => {
            const { currencies } = currencyStore.getState();
            expect(currencies).toEqual({});
        });
    });

    describe('setCurrencies', () => {
        it('should update currencies state', () => {
            const mockCurrencies = {
                USD: 1,
                EUR: 0.85,
                AED: 3.67,
            };

            act(() => {
                currencyStore.getState().setCurrencies(mockCurrencies);
            });

            const { currencies } = currencyStore.getState();
            expect(currencies).toEqual(mockCurrencies);
        });

        it('should replace existing currencies', () => {
            const initialCurrencies = {
                USD: 1,
                EUR: 0.85,
                AED: 3.67,
            };

            const newCurrencies = {
                USD: 1,
                EUR: 0.73,
                AED: 3.50,
            };

            act(() => {
                currencyStore.getState().setCurrencies(initialCurrencies);
            });

            act(() => {
                currencyStore.getState().setCurrencies(newCurrencies);
            });

            const { currencies } = currencyStore.getState();
            expect(currencies).toEqual(newCurrencies);
        });

        it('should handle empty currencies object', () => {
            const initialCurrencies = {
                USD: 1,
                EUR: 0.85,
                AED: 3.67,
            };

            act(() => {
                currencyStore.getState().setCurrencies(initialCurrencies);
            });

            act(() => {
                currencyStore.getState().setCurrencies({});
            });

            const { currencies } = currencyStore.getState();
            expect(currencies).toEqual({});
        });
    });

    describe('fetchCurrencies', () => {
        it('should fetch and set currencies successfully', async () => {
            const mockCurrencies = {
                USD: 1,
                EUR: 0.85,
                AED: 3.67,
            };

            jest.mocked(currencyRate).mockResolvedValue(mockCurrencies);

            const result = await act(async () => {
                return currencyStore.getState().fetchCurrencies();
            });

            expect(jest.mocked(currencyRate)).toHaveBeenCalledTimes(1);
            expect(result).toEqual(mockCurrencies);

            const { currencies } = currencyStore.getState();
            expect(currencies).toEqual(mockCurrencies);
        });

        it('should handle empty currency response', async () => {
            // Since currencyRate has a strict return type, we'll test with minimal valid data
            const emptyCurrencies = {
                USD: 1,
                EUR: 0,
                AED: 0,
            };

            jest.mocked(currencyRate).mockResolvedValue(emptyCurrencies);

            const result = await act(async () => {
                return currencyStore.getState().fetchCurrencies();
            });

            expect(result).toEqual(emptyCurrencies);

            const { currencies } = currencyStore.getState();
            expect(currencies).toEqual(emptyCurrencies);
        });

        it('should handle currency rate API errors', async () => {
            const errorMessage = 'Failed to fetch currency rates';
            jest.mocked(currencyRate).mockRejectedValue(new Error(errorMessage));

            await expect(
                act(async () => {
                    await currencyStore.getState().fetchCurrencies();
                })
            ).rejects.toThrow(errorMessage);

            expect(jest.mocked(currencyRate)).toHaveBeenCalledTimes(1);
        });

        it('should not modify store state on API error', async () => {
            const initialCurrencies = {
                USD: 1,
                EUR: 0.85,
                AED: 3.67,
            };

            act(() => {
                currencyStore.getState().setCurrencies(initialCurrencies);
            });

            jest.mocked(currencyRate).mockRejectedValue(new Error('API Error'));

            try {
                await act(async () => {
                    await currencyStore.getState().fetchCurrencies();
                });
            } catch (error) {
                // Expected to throw
            }

            const { currencies } = currencyStore.getState();
            expect(currencies).toEqual(initialCurrencies);
        });

        it('should handle different currency formats', async () => {
            const mockCurrencies = {
                USD: 1.0,
                EUR: 0.851234,
                AED: 3.673456,
            };

            jest.mocked(currencyRate).mockResolvedValue(mockCurrencies);

            const result = await act(async () => {
                return currencyStore.getState().fetchCurrencies();
            });

            expect(result).toEqual(mockCurrencies);

            const { currencies } = currencyStore.getState();
            expect(currencies['USD']).toBe(1.0);
            expect(currencies['EUR']).toBe(0.851234);
            expect(currencies['AED']).toBe(3.673456);
        });

        it('should handle valid currency data structure', async () => {
            const validCurrencyData = {
                USD: 1,
                EUR: 0.92,
                AED: 3.67,
            };

            jest.mocked(currencyRate).mockResolvedValue(validCurrencyData);

            const result = await act(async () => {
                return currencyStore.getState().fetchCurrencies();
            });

            expect(result).toEqual(validCurrencyData);
            expect(Object.keys(result)).toHaveLength(3);

            const { currencies } = currencyStore.getState();
            expect(Object.keys(currencies)).toHaveLength(3);
            expect(currencies.USD).toBe(1);
            expect(currencies.EUR).toBe(0.92);
            expect(currencies.AED).toBe(3.67);
        });

        it('should handle multiple consecutive fetch calls', async () => {
            const firstCurrencies = {
                USD: 1,
                EUR: 0.85,
                AED: 3.67,
            };

            const secondCurrencies = {
                USD: 1,
                EUR: 0.86,
                AED: 3.68,
            };

            jest.mocked(currencyRate)
                .mockResolvedValueOnce(firstCurrencies)
                .mockResolvedValueOnce(secondCurrencies);

            // First fetch
            const firstResult = await act(async () => {
                return currencyStore.getState().fetchCurrencies();
            });

            expect(firstResult).toEqual(firstCurrencies);

            // Second fetch
            const secondResult = await act(async () => {
                return currencyStore.getState().fetchCurrencies();
            });

            expect(secondResult).toEqual(secondCurrencies);
            expect(jest.mocked(currencyRate)).toHaveBeenCalledTimes(2);

            const { currencies } = currencyStore.getState();
            expect(currencies).toEqual(secondCurrencies);
        });
    });
});
