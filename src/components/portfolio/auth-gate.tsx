'use client';

import { Box, Button, CircularProgress, Typography } from '@mui/material';
import { useConnectModal } from 'thirdweb/react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { connectWalletConfig } from '@/utils/thirdwebConfig';
import { isLoggedIn } from '@/actions/login';
import {
  useActiveAccountCompat,
  useConnectionStatusCompat,
} from '@/hooks/useActiveAccountCompat';
import Navbar from '@/components/navbar';
import Footer from '@/components/footer';

/**
 * Rendered by the portfolio server page when there is no valid session.
 * Opens the retail connect flow and refreshes the page once the session
 * cookie lands, so the server component re-renders with data.
 */
export default function PortfolioAuthGate() {
  const router = useRouter();
  const account = useActiveAccountCompat();
  const status = useConnectionStatusCompat();
  const { connect, isConnecting } = useConnectModal();

  const [checking, setChecking] = useState(false);
  const openedRef = useRef(false);

  const openConnect = async () => {
    setChecking(true);
    try {
      await connect(connectWalletConfig());
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
    if (status === 'connected' || account) {
      isLoggedIn().then((loggedIn) => {
        if (loggedIn) {
          router.refresh();
        }
      });
    }
    if (status === 'disconnected' && !account && !openedRef.current) {
      openedRef.current = true;
      openConnect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, account]);

  return (
    <Box
      sx={{
        backgroundColor: 'marketplace.background',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Navbar />
      <Box
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 3,
          py: 12,
        }}
      >
        {checking || isConnecting || status === 'connecting' ? (
          <CircularProgress sx={{ color: '#C6FF00' }} />
        ) : (
          <>
            <Typography
              variant="h6"
              sx={{ color: 'navbar.primary', fontWeight: 500, textAlign: 'center' }}
            >
              Connect your wallet to see your portfolio
            </Typography>
            <Button
              onClick={openConnect}
              variant="contained"
              sx={{
                backgroundColor: 'marketplace.viewMoreButtonBackground',
                border: 1,
                borderColor: 'marketplace.searchButtonBorder',
                color: 'navbar.primary',
                borderRadius: 5,
                px: 4,
                py: 1,
              }}
            >
              Connect wallet
            </Button>
          </>
        )}
      </Box>
      <Footer />
    </Box>
  );
}
