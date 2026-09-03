'use client';

import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import { cancelListing } from '@/actions/listings';
import {
  chainErrorMessage,
  unlistFractionsOnChain,
} from '@/components/investor/chain';
import { formatUsdc } from '@/components/investor/format';
import { useActiveAccountCompat } from '@/hooks/useActiveAccountCompat';
import type {
  PortfolioHoldingDto,
  PortfolioListingDto,
} from '@/components/portfolio/types';

type Step = 'confirm' | 'signing' | 'recording' | 'record_failed' | 'done';

interface UnlistDialogProps {
  holding: PortfolioHoldingDto;
  listing: PortfolioListingDto;
  open: boolean;
  onClose: (changed: boolean) => void;
}

/**
 * Takes an open resale listing off the market: unlistFractions on chain,
 * then cancelListing records it and releases the locked fractions. A failed
 * record step keeps the hash and offers a retry.
 */
export default function UnlistDialog({ holding, listing, open, onClose }: UnlistDialogProps) {
  const account = useActiveAccountCompat();

  const [step, setStep] = useState<Step>('confirm');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const busy = step === 'signing' || step === 'recording';

  const close = () => {
    if (!busy) {
      onClose(step === 'done');
    }
  };

  const record = async (hash: string) => {
    setStep('recording');
    const result = await cancelListing({ listingId: listing.id, txHash: hash });
    if (!result.ok) {
      setError(result.error.message);
      setStep('record_failed');
      return;
    }
    setError(null);
    setStep('done');
  };

  const submit = async () => {
    if (!account) {
      setError('Connect your wallet first.');
      return;
    }
    if (holding.nftId === null) {
      setError('This asset is not live on chain yet.');
      return;
    }
    setError(null);

    let hash: string;
    try {
      setStep('signing');
      hash = await unlistFractionsOnChain(account, holding.nftId, listing.pricePerFraction);
      setTxHash(hash);
    } catch (chainError) {
      setError(chainErrorMessage(chainError));
      setStep('confirm');
      return;
    }

    await record(hash);
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      fullWidth
      maxWidth="xs"
      PaperProps={{ sx: { backgroundColor: 'marketplace.background', borderRadius: 3 } }}
    >
      <DialogTitle sx={{ color: 'navbar.primary', fontWeight: 500 }}>
        Unlist fractions
      </DialogTitle>
      <DialogContent>
        {step === 'done' ? (
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <Typography variant="subtitle1" sx={{ color: 'navbar.primary', fontWeight: 500 }}>
              Listing removed
            </Typography>
            <Typography variant="body2" sx={{ color: 'marketplace.filterButtonText', mt: 1 }}>
              Your {listing.quantity} fraction{listing.quantity > 1 ? 's' : ''} of{' '}
              {holding.assetName} are no longer for sale.
            </Typography>
            <Button
              variant="contained"
              onClick={close}
              sx={{
                mt: 3,
                backgroundColor: 'marketplace.viewMoreButtonBackground',
                color: 'marketplace.searchButtonText',
                border: 1,
                borderColor: 'marketplace.searchButtonBorder',
                borderRadius: 5,
                px: 4,
              }}
            >
              Done
            </Button>
          </Box>
        ) : (
          <>
            <Typography variant="body2" sx={{ color: 'marketplace.filterButtonText' }}>
              Remove your listing of {listing.quantity} fraction
              {listing.quantity > 1 ? 's' : ''} of {holding.assetName} at{' '}
              {formatUsdc(listing.pricePerFraction)} USDC each?
            </Typography>

            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}

            {step === 'record_failed' ? (
              <Box sx={{ mt: 2 }}>
                <Alert severity="warning">
                  The unlist went through on chain but recording it on the platform failed.
                  Retry so the listing disappears for buyers.
                </Alert>
                <Button
                  variant="contained"
                  onClick={() => txHash && record(txHash)}
                  sx={{
                    mt: 2,
                    backgroundColor: 'marketplace.viewMoreButtonBackground',
                    color: 'marketplace.searchButtonText',
                    border: 1,
                    borderColor: 'marketplace.searchButtonBorder',
                    borderRadius: 5,
                    px: 3,
                  }}
                >
                  Retry recording
                </Button>
              </Box>
            ) : (
              <>
                <Box sx={{ display: 'flex', gap: 2, mt: 3, justifyContent: 'flex-end' }}>
                  <Button onClick={close} disabled={busy} sx={{ color: 'marketplace.filterButtonText' }}>
                    Keep listing
                  </Button>
                  <Button
                    variant="contained"
                    onClick={submit}
                    disabled={busy}
                    sx={{
                      backgroundColor: 'marketplace.viewMoreButtonBackground',
                      color: 'marketplace.searchButtonText',
                      border: 1,
                      borderColor: 'marketplace.searchButtonBorder',
                      borderRadius: 5,
                      px: 3,
                    }}
                  >
                    Unlist
                    {busy && <CircularProgress size={16} sx={{ color: 'inherit', ml: 1 }} />}
                  </Button>
                </Box>
                {busy && (
                  <Typography
                    variant="caption"
                    sx={{ color: 'marketplace.filterButtonText', display: 'block', mt: 1, textAlign: 'right' }}
                  >
                    {step === 'signing' && 'Confirm the unlist in your wallet...'}
                    {step === 'recording' && 'Recording the unlist...'}
                  </Typography>
                )}
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
