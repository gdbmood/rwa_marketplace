'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';

/**
 * Mock on-ramp provider page (TEST_MODE only). The mock provider's
 * redirectUrl points here so the buy flow follows the same redirect shape as
 * a real provider. The buttons post a mock webhook event
 * ({ providerSessionId, status }) so a payment can be completed, failed or
 * canceled deterministically; simply leaving the checkout polling also
 * advances the mock session to completed on its own.
 */

type Result = 'idle' | 'sending' | 'sent' | 'error';

function MockOnrampInner() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session');

  const [result, setResult] = useState<Result>('idle');
  const [sentStatus, setSentStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async (status: 'completed' | 'failed' | 'canceled') => {
    if (!sessionId) {
      return;
    }
    setResult('sending');
    setError(null);
    try {
      const response = await fetch('/api/onramp/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerSessionId: sessionId, status }),
      });
      const body = (await response.json()) as
        | { ok: true; data: { handled: boolean } }
        | { ok: false; error: { message: string } };
      if (!body.ok) {
        setError(body.error.message);
        setResult('error');
        return;
      }
      setSentStatus(status);
      setResult('sent');
    } catch {
      setError('Could not reach the mock webhook endpoint.');
      setResult('error');
    }
  };

  return (
    <Box
      sx={{
        backgroundColor: 'marketplace.background',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 3,
      }}
    >
      <Box
        sx={{
          backgroundColor: 'listingCard.background',
          borderRadius: 3,
          p: { xs: 3, sm: 5 },
          maxWidth: 480,
          width: '100%',
          textAlign: 'center',
        }}
      >
        <Typography variant="h5" sx={{ color: 'navbar.primary', fontWeight: 600 }}>
          Mock payment provider
        </Typography>
        <Typography variant="body2" sx={{ color: 'marketplace.filterButtonText', mt: 1.5 }}>
          Test mode only. This page stands in for the card payment provider.
        </Typography>

        {!sessionId ? (
          <Alert severity="error" sx={{ mt: 3, textAlign: 'left' }}>
            Missing session parameter. Open this page from the checkout flow.
          </Alert>
        ) : result === 'sent' ? (
          <Alert
            severity={sentStatus === 'completed' ? 'success' : 'warning'}
            sx={{ mt: 3, textAlign: 'left' }}
          >
            Payment {sentStatus}. You can close this tab; the checkout page picks the
            result up automatically.
          </Alert>
        ) : (
          <>
            <Typography
              variant="caption"
              sx={{ color: 'marketplace.filterButtonText', display: 'block', mt: 2, wordBreak: 'break-all' }}
            >
              Session: {sessionId}
            </Typography>
            {error && (
              <Alert severity="error" sx={{ mt: 2, textAlign: 'left' }}>
                {error}
              </Alert>
            )}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 3 }}>
              <Button
                variant="contained"
                disabled={result === 'sending'}
                onClick={() => send('completed')}
                sx={{
                  backgroundColor: 'marketplace.viewMoreButtonBackground',
                  color: 'marketplace.searchButtonText',
                  border: 1,
                  borderColor: 'marketplace.searchButtonBorder',
                  borderRadius: 5,
                  py: 1.2,
                }}
              >
                Complete payment
                {result === 'sending' && (
                  <CircularProgress size={18} sx={{ color: 'inherit', ml: 1.5 }} />
                )}
              </Button>
              <Button
                disabled={result === 'sending'}
                onClick={() => send('failed')}
                sx={{ color: 'error.main' }}
              >
                Simulate failed payment
              </Button>
              <Button
                disabled={result === 'sending'}
                onClick={() => send('canceled')}
                sx={{ color: 'marketplace.filterButtonText' }}
              >
                Cancel payment
              </Button>
            </Box>
            <Typography variant="caption" sx={{ color: 'marketplace.filterButtonText', display: 'block', mt: 3 }}>
              Doing nothing also works: the checkout keeps polling and the mock session
              completes on its own.
            </Typography>
          </>
        )}
      </Box>
    </Box>
  );
}

export default function MockOnrampPage() {
  return (
    <Suspense
      fallback={
        <Box
          sx={{
            backgroundColor: 'marketplace.background',
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CircularProgress sx={{ color: '#C6FF00' }} />
        </Box>
      }
    >
      <MockOnrampInner />
    </Suspense>
  );
}
