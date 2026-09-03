"use client";

import { useEffect, useState } from "react";
import { useActiveAccount, useActiveWalletConnectionStatus } from "thirdweb/react";
import type { Account } from "thirdweb/wallets";
import { getTestAccount, isTestMode } from "@/lib/wallet/testAccount";

/**
 * Drop-in replacements for thirdweb's useActiveAccount and
 * useActiveWalletConnectionStatus that pages must use instead of the raw
 * hooks. In production they behave identically; with NEXT_PUBLIC_TEST_MODE=1
 * they transparently return the local EOA built from the Playwright supplied
 * private key (localStorage "e2e_pk"), so e2e runs can sign transactions
 * against a local hardhat node without the thirdweb in app wallet.
 */

/** Event fired when the test wallet key changes within the same tab. */
export const TEST_WALLET_CHANGED_EVENT = "e2e-wallet-changed";

function useTestAccount(): Account | null {
    // Read in an effect (not during render) so SSR and hydration agree.
    const [account, setAccount] = useState<Account | null>(null);

    useEffect(() => {
        if (!isTestMode()) {
            return;
        }
        const refresh = () => setAccount(getTestAccount());
        refresh();
        window.addEventListener("storage", refresh);
        window.addEventListener(TEST_WALLET_CHANGED_EVENT, refresh);
        return () => {
            window.removeEventListener("storage", refresh);
            window.removeEventListener(TEST_WALLET_CHANGED_EVENT, refresh);
        };
    }, []);

    return account;
}

/** The active account: the real thirdweb one, or the test EOA in test mode. */
export function useActiveAccountCompat(): Account | undefined {
    const realAccount = useActiveAccount();
    const testAccount = useTestAccount();
    if (isTestMode() && testAccount) {
        return testAccount;
    }
    return realAccount;
}

export type ConnectionStatusCompat = ReturnType<typeof useActiveWalletConnectionStatus>;

/**
 * Connection status that reports "connected" when the test account is
 * present, so screens gated on wallet connection work in test mode.
 */
export function useConnectionStatusCompat(): ConnectionStatusCompat {
    const realStatus = useActiveWalletConnectionStatus();
    const testAccount = useTestAccount();
    if (isTestMode() && testAccount) {
        return "connected";
    }
    return realStatus;
}
