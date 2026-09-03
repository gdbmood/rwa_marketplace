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
  TextField,
  Typography,
} from '@mui/material';
import { updateListingPrice } from '@/actions/listings';
import {
  approveFractionSpend,
  chainErrorMessage,
  sellFractionsOnChain,
  unlistFractionsOnChain,
} from '@/components/investor/chain';
import { formatUsdc } from '@/components/investor/format';
import { useActiveAccountCompat } from '@/hooks/useActiveAccountCompat';
import type {
  PortfolioHoldingDto,
  PortfolioListingDto,
} from '@/components/portfolio/types';

type Step = 'form' | 'unlisting' | 'relisting' | 'recording' | 'record_failed' | 'done';

interface UpdatePriceDialogProps {
  holding: PortfolioHoldingDto;
  listing: PortfolioListingDto;
  open: boolean;
  onClose: (changed: boolean) => void;
}

/**
 * Updates the price of an open resale listing. The deployed contract has no
 * price update for resales, so the chain path mirrors the legacy flow:
 * unlistFractions at the old price, then sellFractions at the new price
 * (with a fresh approval), then updateListingPrice records the change with
 * the verified relist transaction hash.
 */
export default function UpdatePriceDialog({
  holding,
  listing,
  open,
  onClose,
}: UpdatePriceDialogProps) {
  const account = useActiveAccountCompat();

  const [price, setPrice] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const busy = step === 'unlisting' || step === 'relisting' || step === 'recording';
  const priceNumber = Number.parseFloat(price);
  const priceValid =
    /^\d+(\.\d{1,6})?$/.test(price.trim()) && Number.isFinite(priceNumber) && priceNumber > 0;

  const close = () => {
    if (!busy) {
      onClose(step === 'done');
    }
  };

  const record = async (hash: string) => {
    setStep('recording');
    const result = await updateListingPrice({
      listingId: listing.id,
      newPrice: price.trim(),
      txHash: hash,
    });
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
    if (holding.nftId === null || !holding.erc20TokenAddress) {
      setError('This asset is not live on chain yet.');
      return;
    }
    if (!priceValid) {
      setError('Enter a price per fraction greater than zero.');
      return;
    }
    setError(null);

    let hash: string;
    try {
      setStep('unlisting');
      await unlistFractionsOnChain(account, holding.nftId, listing.pricePerFraction);
      setStep('relisting');
      await approveFractionSpend(account, holding.erc20TokenAddress, listing.quantity);
      hash = await sellFractionsOnChain(
        account,
        holding.nftId,
        listing.quantity,
        price.trim(),
      );
      setTxHash(hash);
    } catch (chainError) {
      setError(chainErrorMessage(chainError));
      setStep('form');
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
        Update listing price
      </DialogTitle>
      <DialogContent>
        {step === 'done' ? (
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <Typography variant="subtitle1" sx={{ color: 'navbar.primary', fontWeight: 500 }}>
              Price updated
            </Typography>
            <Typography variant="body2" sx={{ color: 'marketplace.filterButtonText', mt: 1 }}>
              Your listing on {holding.assetName} is now {formatUsdc(price)} USDC per
              fraction.
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
              {listing.quantity} fraction{listing.quantity > 1 ? 's' : ''} of{' '}
              {holding.assetName} currently listed at {formatUsdc(listing.pricePerFraction)}{' '}
              USDC each.
            </Typography>

            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}

            {step === 'record_failed' ? (
              <Box sx={{ mt: 2 }}>
                <Alert severity="warning">
                  The new price is live on chain but recording it on the platform failed.
                  Retry so buyers see the right price.
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
                <TextField
                  fullWidth
                  size="small"
                  label="New price per fraction (USDC)"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  disabled={busy}
                  error={price !== '' && !priceValid}
                  helperText={price !== '' && !priceValid ? 'Enter a positive amount' : ' '}
                  sx={{
                    mt: 3,
                    '& .MuiOutlinedInput-root': { color: 'navbar.primary' },
                    '& .MuiInputLabel-root': { color: 'marketplace.filterButtonText' },
                  }}
                />
                <Typography variant="caption" sx={{ color: 'marketplace.filterButtonText' }}>
                  Two wallet confirmations are needed: unlist at the old price, then relist
                  at the new one.
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, mt: 3, justifyContent: 'flex-end' }}>
                  <Button onClick={close} disabled={busy} sx={{ color: 'marketplace.filterButtonText' }}>
                    Cancel
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
                    Update price
                    {busy && <CircularProgress size={16} sx={{ color: 'inherit', ml: 1 }} />}
                  </Button>
                </Box>
                {busy && (
                  <Typography
                    variant="caption"
                    sx={{ color: 'marketplace.filterButtonText', display: 'block', mt: 1, textAlign: 'right' }}
                  >
                    {step === 'unlisting' && 'Confirm the unlist in your wallet...'}
                    {step === 'relisting' && 'Confirm the new listing in your wallet...'}
                    {step === 'recording' && 'Recording the new price...'}
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
