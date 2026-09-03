import { privateKeyToAccount } from "thirdweb/wallets";
import type { Account } from "thirdweb/wallets";
import { client } from "@/lib/thirdWebClient";

/**
 * Test mode wallet plumbing (browser only).
 *
 * When NEXT_PUBLIC_TEST_MODE is 1 the app signs transactions with a local EOA
 * built from a private key that Playwright stores under the localStorage key
 * "e2e_pk", instead of the thirdweb in app wallet. Production builds never
 * read the key: every entry point below is a no-op unless the flag is set.
 *
 * See docs/architecture/IMPLEMENTATION_PLAN.md, "Test mode".
 */

export const E2E_PRIVATE_KEY_STORAGE_KEY = "e2e_pk";

const PRIVATE_KEY_PATTERN = /^0x[0-9a-fA-F]{64}$/;

/** True when the client bundle was built with NEXT_PUBLIC_TEST_MODE=1. */
export function isTestMode(): boolean {
    return process.env.NEXT_PUBLIC_TEST_MODE === "1";
}

/**
 * Reads the e2e private key from localStorage. Null outside test mode, on the
 * server, or when the key is absent or malformed.
 */
export function getTestPrivateKey(): string | null {
    if (!isTestMode() || typeof window === "undefined") {
        return null;
    }
    let raw: string | null = null;
    try {
        raw = window.localStorage.getItem(E2E_PRIVATE_KEY_STORAGE_KEY);
    } catch {
        return null;
    }
    if (!raw) {
        return null;
    }
    const key = raw.startsWith("0x") ? raw : `0x${raw}`;
    return PRIVATE_KEY_PATTERN.test(key) ? key : null;
}

let cachedAccount: { privateKey: string; account: Account } | null = null;

/**
 * The thirdweb Account for the e2e private key, or null when unavailable.
 * Cached per key so repeated calls return a stable object.
 */
export function getTestAccount(): Account | null {
    const privateKey = getTestPrivateKey();
    if (!privateKey) {
        return null;
    }
    if (cachedAccount && cachedAccount.privateKey === privateKey) {
        return cachedAccount.account;
    }
    try {
        const account = privateKeyToAccount({ client, privateKey });
        cachedAccount = { privateKey, account };
        return account;
    } catch {
        return null;
    }
}

/**
 * Logs the test wallet in by POSTing the derived address to /api/test-auth,
 * which issues the same session cookie as the production login action.
 * Returns the wallet address, or throws with a readable message.
 */
export async function loginTestWallet(
    userType: "retail" | "business" = "retail",
): Promise<string> {
    const account = getTestAccount();
    if (!account) {
        throw new Error(
            `Test wallet key missing: set localStorage["${E2E_PRIVATE_KEY_STORAGE_KEY}"] to a private key first`,
        );
    }
    const response = await fetch("/api/test-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: account.address, type: userType }),
    });
    if (!response.ok) {
        let message = `Test login failed (${response.status})`;
        try {
            const body = (await response.json()) as { error?: unknown };
            if (typeof body.error === "string") {
                message = body.error;
            }
        } catch {
            // Keep the status message.
        }
        throw new Error(message);
    }
    return account.address;
}
