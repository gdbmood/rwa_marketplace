"use server";

interface CurrencyRateResult {
    time_next_update_unix: number;
    conversion_rates: {
        EUR: number;
        AED: number;
    }
}

let result: CurrencyRateResult | null = null;

export async function currencyRate() {
    if (!result || (result && Math.floor(Date.now() / 1000) > result.time_next_update_unix)) {
        const req = await fetch('https://v6.exchangerate-api.com/v6/728eda2f8fc18ac492f2b410/latest/USD')
        result = await req.json()
    }

    if (result) {
        return {
            "USD": 1,
            "EUR": result.conversion_rates.EUR,
            "AED": result.conversion_rates.AED,
        }
    }
    throw new Error('Failed to fetch currency rates');
}