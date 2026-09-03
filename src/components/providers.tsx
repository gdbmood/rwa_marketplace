"use client";

import { useEffect } from "react";
import { ThirdwebProvider } from "thirdweb/react";
import sessionStore from "@/store/sessionStore";
import currencyStore from "@/store/currencyStore";

/**
 * Client side providers and one-time state hydration. The session cookie is
 * HttpOnly, so the session store must ask the server whether a session
 * exists; currency rates are prefetched because most product screens show
 * fiat conversions.
 */
export default function AppProviders({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        const session = sessionStore.getState();
        if (session.status === "idle") {
            void session.refresh();
        }
        const currency = currencyStore.getState();
        if (Object.keys(currency.currencies).length === 0 && !currency.loading) {
            void currency.fetchCurrencies();
        }
    }, []);

    return <ThirdwebProvider>{children}</ThirdwebProvider>;
}
