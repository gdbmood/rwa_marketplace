import { currencyRate } from '@/actions/currency-rate';
import { create } from 'zustand';

type Currencies = {
    [key: string]: number;
}

const currencyStore = create<
    {
        currencies: Currencies;
        setCurrencies: (newState: Currencies) => void;
        fetchCurrencies: () => Promise<Currencies>;
    }
>((set, get) => ({
    currencies: {},
    setCurrencies: (newState: Currencies) => set({ currencies: newState }),
    fetchCurrencies: async () => {
        const currencies = await currencyRate();
        set({ currencies });
        return currencies;
    }
}));

export default currencyStore;