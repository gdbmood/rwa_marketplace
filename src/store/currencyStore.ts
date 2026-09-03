import { create } from 'zustand';
import { currencyRate } from '@/actions/currency';

/**
 * USD conversion rates for display currencies, fetched through the currency
 * server action (the API key never reaches the browser). Keys are currency
 * codes (USD, EUR, AED), values are units per USD.
 */

type Currencies = {
    [key: string]: number;
};

interface CurrencyState {
    currencies: Currencies;
    loading: boolean;
    error: string | null;
    setCurrencies: (newState: Currencies) => void;
    fetchCurrencies: () => Promise<Currencies>;
}

const currencyStore = create<CurrencyState>((set, get) => ({
    currencies: {},
    loading: false,
    error: null,
    setCurrencies: (newState: Currencies) => set({ currencies: newState }),
    fetchCurrencies: async () => {
        set({ loading: true, error: null });
        try {
            const currencies = await currencyRate();
            set({ currencies, loading: false });
            return currencies;
        } catch (error) {
            console.error('currencyStore.fetchCurrencies:', error);
            set({ loading: false, error: 'Could not load exchange rates' });
            // Callers keep whatever rates were loaded before (possibly {}).
            return get().currencies;
        }
    },
}));

export default currencyStore;
