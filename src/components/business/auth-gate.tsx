"use client";

import { Box, Button, CircularProgress, Typography } from "@mui/material";
import { useConnectModal } from "thirdweb/react";
import { useConnectionStatusCompat } from "@/hooks/useActiveAccountCompat";
import { connectWalletConfig } from "@/utils/thirdwebConfig";
import { isTestMode } from "@/lib/wallet/testAccount";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { isLoggedIn } from "@/actions/login";

/**
 * Rendered by business server pages when there is no valid session. Opens the
 * business connect flow and refreshes the page once the session cookie lands,
 * so the server component re-renders with data.
 */
export default function BusinessAuthGate(props: { message?: string }) {
    const router = useRouter();
    const status = useConnectionStatusCompat();
    const { connect, isConnecting } = useConnectModal();

    const [checking, setChecking] = useState(false);
    const openedRef = useRef(false);

    const openConnect = async () => {
        setChecking(true);
        try {
            await connect(connectWalletConfig('business'));
            if (await isLoggedIn()) {
                router.refresh();
                return;
            }
        } catch {
            // The user closed the modal; fall through to the manual button.
        }
        setChecking(false);
    };

    useEffect(() => {
        // A connected wallet with no server session (stale cookie) also lands
        // here: poll once so a fresh login elsewhere picks the page back up.
        if (status === 'connected') {
            isLoggedIn().then((loggedIn) => {
                if (loggedIn) {
                    router.refresh();
                }
            });
        }
        // In test mode the login happens through the navbar test wallet
        // button; never auto-open the thirdweb modal there.
        if (status === 'disconnected' && !openedRef.current && !isTestMode()) {
            openedRef.current = true;
            openConnect();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status]);

    return (
        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 3, py: 12 }}>
            {checking || isConnecting || status === 'connecting' ?
                <CircularProgress sx={{ color: '#C6FF00' }} />
                :
                <>
                    <Typography variant="h6" sx={{ color: 'navbar.primary', fontWeight: 500, textAlign: 'center' }}>
                        {props.message ?? 'Connect your business wallet to continue'}
                    </Typography>
                    <Button onClick={openConnect} variant="contained" sx={{ backgroundColor: 'marketplace.viewMoreButtonBackground', border: 1, borderColor: 'marketplace.searchButtonBorder', color: 'navbar.primary', borderRadius: 5, px: 4, py: 1 }}>
                        Connect wallet
                    </Button>
                </>
            }
        </Box>
    );
}
