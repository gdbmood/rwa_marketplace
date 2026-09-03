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
  Slider,
  TextField,
  Typography,
} from '@mui/material';
import { recordSecondaryListing } from '@/actions/listings';
import {
  approveFractionSpend,
  chainErrorMessage,
  sellFractionsOnChain,
} from '@/components/investor/chain';
import { formatUsdc } from '@/components/investor/format';
import { useActiveAccountCompat } from '@/hooks/useActiveAccountCompat';
import type { PortfolioHoldingDto } from '@/components/portfolio/types';

type Step = 'form' | 'approving' | 'signing' | 'recording' | 'record_failed' | 'done';

interface SellDialogProps {
  holding: PortfolioHoldingDto;
  open: boolean;
  onClose: (changed: boolean) => void;
}

/**
 * Lists fractions for resale: ERC20 approve, sellFractions on chain, then
 * recordSecondaryListing with the verified transaction hash. A failed record
 * step keeps the hash and offers a retry so a confirmed chain listing is
 * never lost.
 */
export default function SellDialog({ holding, open, onClose }: SellDialogProps) {
  const account = useActiveAccountCompat();

  const available = holding.quantity - holding.lockedQuantity;
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const busy = step === 'approving' || step === 'signing' || step === 'recording';
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
    const result = await recordSecondaryListing({
      assetId: holding.assetId,
      quantity,
      pricePerFraction: price.trim(),
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
    if (quantity < 1 || quantity > available) {
      setError(`You can list between 1 and ${available} fraction(s).`);
      return;
    }
    setError(null);

    let hash: string;
    try {
      setStep('approving');
      await approveFractionSpend(account, holding.erc20TokenAddress, quantity);
      setStep('signing');
      hash = await sellFractionsOnChain(account, holding.nftId, quantity, price.trim());
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
        Sell fractions
      </DialogTitle>
      <DialogContent>
        {step === 'done' ? (
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <Typography variant="subtitle1" sx={{ color: 'navbar.primary', fontWeight: 500 }}>
              Listing created
            </Typography>
            <Typography variant="body2" sx={{ color: 'marketplace.filterButtonText', mt: 1 }}>
              {quantity} fraction{quantity > 1 ? 's' : ''} of {holding.assetName} listed at{' '}
              {formatUsdc(price)} USDC each.
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
              {holding.assetName}: {available} of {holding.quantity} fraction
              {holding.quantity > 1 ? 's' : ''} available to list.
            </Typography>

            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}

            {step === 'record_failed' ? (
              <Box sx={{ mt: 2 }}>
                <Alert severity="warning">
                  The listing is on chain but recording it on the platform failed. Retry so
                  it shows up for buyers.
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
                <Box sx={{ mt: 3, display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" sx={{ color: 'marketplace.filterButtonText' }}>
                    Fractions to list
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'navbar.primary', fontWeight: 500 }}>
                    {quantity}
                  </Typography>
                </Box>
                <Slider
                  value={quantity}
                  onChange={(_, value) => setQuantity(Array.isArray(value) ? value[0] : value)}
                  min={1}
                  max={Math.max(available, 1)}
                  step={1}
                  disabled={busy || available < 1}
                  sx={{ color: 'assetPurchase.slider' }}
                />
                <TextField
                  fullWidth
                  size="small"
                  label="Price per fraction (USDC)"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  disabled={busy}
                  error={price !== '' && !priceValid}
                  helperText={price !== '' && !priceValid ? 'Enter a positive amount' : ' '}
                  sx={{
                    mt: 2,
                    '& .MuiOutlinedInput-root': { color: 'navbar.primary' },
                    '& .MuiInputLabel-root': { color: 'marketplace.filterButtonText' },
                  }}
                />
                {priceValid && (
                  <Typography variant="caption" sx={{ color: 'marketplace.filterButtonText' }}>
                    Total: {formatUsdc(priceNumber * quantity)} USDC
                  </Typography>
                )}
                <Box sx={{ display: 'flex', gap: 2, mt: 3, justifyContent: 'flex-end' }}>
                  <Button onClick={close} disabled={busy} sx={{ color: 'marketplace.filterButtonText' }}>
                    Cancel
                  </Button>
                  <Button
                    variant="contained"
                    onClick={submit}
                    disabled={busy || available < 1}
                    sx={{
                      backgroundColor: 'marketplace.viewMoreButtonBackground',
                      color: 'marketplace.searchButtonText',
                      border: 1,
                      borderColor: 'marketplace.searchButtonBorder',
                      borderRadius: 5,
                      px: 3,
                    }}
                  >
                    List for sale
                    {busy && <CircularProgress size={16} sx={{ color: 'inherit', ml: 1 }} />}
                  </Button>
                </Box>
                {busy && (
                  <Typography
                    variant="caption"
                    sx={{ color: 'marketplace.filterButtonText', display: 'block', mt: 1, textAlign: 'right' }}
                  >
                    {step === 'approving' && 'Approve the marketplace in your wallet...'}
                    {step === 'signing' && 'Confirm the listing in your wallet...'}
                    {step === 'recording' && 'Recording the listing...'}
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
