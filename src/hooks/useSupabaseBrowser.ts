"use client";

import { useMemo } from "react";
import { type BrowserClient, createBrowserClient } from "@/lib/supabase/client";

/**
 * Browser side Supabase access, read only by design (writes go through
 * server actions and are rejected by RLS from here).
 *
 * Two singleton clients:
 *  - the public client uses the anon key alone, enough for public rows
 *    (asset_categories, v_marketplace, active listings)
 *  - the authed client attaches the short-lived RLS JWT from /api/rls-token
 *    so RLS can see the caller's own rows (v_portfolio, orders, transactions)
 */

let publicClient: BrowserClient | null = null;

export function getPublicSupabase(): BrowserClient {
    if (!publicClient) {
        publicClient = createBrowserClient();
    }
    return publicClient;
}

interface CachedRlsToken {
    token: string;
    /** Unix seconds after which the token must be refreshed. */
    refreshAfter: number;
}

/** Refresh this many seconds before the JWT actually expires. */
const TOKEN_REFRESH_MARGIN_SECONDS = 60;

let cachedToken: CachedRlsToken | null = null;
let inflightToken: Promise<string | null> | null = null;

function decodeJwtExp(token: string): number | null {
    try {
        const payload = token.split(".")[1];
        const decoded = JSON.parse(
            atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
        ) as { exp?: unknown };
        return typeof decoded.exp === "number" ? decoded.exp : null;
    } catch {
        return null;
    }
}

async function fetchRlsToken(): Promise<string | null> {
    try {
        const response = await fetch("/api/rls-token", { cache: "no-store" });
        if (!response.ok) {
            return null;
        }
        const body = (await response.json()) as { token?: unknown };
        return typeof body.token === "string" ? body.token : null;
    } catch {
        return null;
    }
}

/**
 * Returns a valid RLS JWT, minting a new one when the cache is empty or close
 * to expiry. Null when the user has no session; the client then falls back to
 * anon reads and RLS hides private rows.
 */
async function getRlsToken(): Promise<string | null> {
    const now = Math.floor(Date.now() / 1000);
    if (cachedToken && now < cachedToken.refreshAfter) {
        return cachedToken.token;
    }
    if (!inflightToken) {
        inflightToken = fetchRlsToken()
            .then((token) => {
                if (token) {
                    const exp = decodeJwtExp(token);
                    cachedToken = {
                        token,
                        refreshAfter: exp
                            ? exp - TOKEN_REFRESH_MARGIN_SECONDS
                            : now + 5 * 60,
                    };
                } else {
                    cachedToken = null;
                }
                return token;
            })
            .finally(() => {
                inflightToken = null;
            });
    }
    return inflightToken;
}

/** Drops the cached RLS token, e.g. after logout. */
export function clearRlsTokenCache(): void {
    cachedToken = null;
}

let authedClient: BrowserClient | null = null;

export function getAuthedSupabase(): BrowserClient {
    if (!authedClient) {
        authedClient = createBrowserClient({ accessToken: getRlsToken });
    }
    return authedClient;
}

/**
 * Hook wrapper: `useSupabaseBrowser()` for public reads,
 * `useSupabaseBrowser(true)` for reads that need the caller's own rows.
 */
export function useSupabaseBrowser(authed = false): BrowserClient {
    return useMemo(() => (authed ? getAuthedSupabase() : getPublicSupabase()), [authed]);
}
