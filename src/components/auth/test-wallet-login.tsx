"use client";

import { useState } from "react";
import { Box, Button, CircularProgress, Tooltip, Typography, useColorScheme } from "@mui/material";
import sessionStore from "@/store/sessionStore";
import { TEST_WALLET_CHANGED_EVENT } from "@/hooks/useActiveAccountCompat";
import { isTestMode, loginTestWallet } from "@/lib/wallet/testAccount";
import type { Enums } from "@/types/database";

/**
 * Test-mode replacement for the thirdweb ConnectButton: logs in as the local
 * e2e wallet (localStorage "e2e_pk", set by Playwright) through
 * /api/test-auth, then refreshes the client session state. Renders nothing
 * outside NEXT_PUBLIC_TEST_MODE=1.
 */
export default function TestWalletLogin({ userType = "retail" }: { userType?: Enums<'user_type'> }) {
    const user = sessionStore((state) => state.user);
    const refresh = sessionStore((state) => state.refresh);
    const doLogout = sessionStore((state) => state.logout);
    const { mode } = useColorScheme();

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isTestMode()) {
        return null;
    }

    const buttonStyle = {
        backgroundColor: mode === "dark" ? "#C6FF00" : "#36AB00",
        color: mode === "dark" ? "#212121" : "#FAFAFA",
        borderRadius: "71px",
        textTransform: "none" as const,
        px: 2.5,
    };

    const handleLogin = async () => {
        setBusy(true);
        setError(null);
        try {
            await loginTestWallet(userType);
            window.dispatchEvent(new Event(TEST_WALLET_CHANGED_EVENT));
            await refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Test login failed");
        } finally {
            setBusy(false);
        }
    };

    const handleLogout = async () => {
        setBusy(true);
        setError(null);
        try {
            await doLogout();
        } finally {
            setBusy(false);
        }
    };

    return (
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.5 }}>
            {user ? (
                <Button
                    data-testid="test-wallet-logout"
                    onClick={handleLogout}
                    disabled={busy}
                    sx={buttonStyle}
                    startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
                >
                    Log out test wallet
                </Button>
            ) : (
                <Tooltip title='Uses the private key stored under localStorage["e2e_pk"]'>
                    <Button
                        data-testid="test-wallet-login"
                        onClick={handleLogin}
                        disabled={busy}
                        sx={buttonStyle}
                        startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
                    >
                        Log in as test wallet
                    </Button>
                </Tooltip>
            )}
            {error && (
                <Typography variant="caption" color="error" data-testid="test-wallet-error">
                    {error}
                </Typography>
            )}
        </Box>
    );
}
