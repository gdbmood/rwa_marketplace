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
import { recordTransfer } from '@/actions/transfer';
import {
  chainErrorMessage,
  transferFractionsOnChain,
} from '@/components/investor/chain';
import { useActiveAccountCompat } from '@/hooks/useActiveAccountCompat';
import type { PortfolioHoldingDto } from '@/components/portfolio/types';

type Step = 'form' | 'signing' | 'recording' | 'record_failed' | 'done';

const WALLET_PATTERN = /^0x[a-fA-F0-9]{40}$/;

interface TransferDialogProps {
  holding: PortfolioHoldingDto;
  open: boolean;
  onClose: (changed: boolean) => void;
}

/**
 * Sends fractions to another wallet: a plain ERC20 transfer signed by the
 * user, then recordTransfer verifies the receipt server side and writes the
 * ledger row. The indexer stays authoritative for both parties' balances.
 */
export default function TransferDialog({ holding, open, onClose }: TransferDialogProps) {
  const account = useActiveAccountCompat();

  const available = holding.quantity - holding.lockedQuantity;
  const [quantity, setQuantity] = useState(1);
  const [toWallet, setToWallet] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const busy = step === 'signing' || step === 'recording';
  const walletValid = WALLET_PATTERN.test(toWallet.trim());

  const close = () => {
    if (!busy) {
      onClose(step === 'done');
    }
  };

  const record = async (hash: string) => {
    setStep('recording');
    const result = await recordTransfer({
      assetId: holding.assetId,
      toWallet: toWallet.trim(),
      quantity,
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
    if (!holding.erc20TokenAddress) {
      setError('This asset is not live on chain yet.');
      return;
    }
    const recipient = toWallet.trim();
    if (!WALLET_PATTERN.test(recipient)) {
      setError('Enter a valid wallet address (0x...).');
      return;
    }
    if (recipient.toLowerCase() === account.address.toLowerCase()) {
      setError('You cannot send fractions to yourself.');
      return;
    }
    if (quantity < 1 || quantity > available) {
      setError(`You can send between 1 and ${available} fraction(s).`);
      return;
    }
    setError(null);

    let hash: string;
    try {
      setStep('signing');
      hash = await transferFractionsOnChain(
        account,
        holding.erc20TokenAddress,
        recipient,
        quantity,
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
        Send fractions
      </DialogTitle>
      <DialogContent>
        {step === 'done' ? (
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <Typography variant="subtitle1" sx={{ color: 'navbar.primary', fontWeight: 500 }}>
              Fractions sent
            </Typography>
            <Typography variant="body2" sx={{ color: 'marketplace.filterButtonText', mt: 1 }}>
              {quantity} fraction{quantity > 1 ? 's' : ''} of {holding.assetName} sent to{' '}
              {toWallet.trim().slice(0, 6)}...{toWallet.trim().slice(-4)}.
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
              {holding.assetName}: {available} fraction{available === 1 ? '' : 's'} available
              to send (listed fractions stay locked).
            </Typography>

            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}

            {step === 'record_failed' ? (
              <Box sx={{ mt: 2 }}>
                <Alert severity="warning">
                  The transfer went through on chain but recording it on the platform
                  failed. Retry so your history stays accurate; balances sync automatically
                  either way.
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
                    Fractions to send
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
                  label="Recipient wallet address"
                  placeholder="0x..."
                  value={toWallet}
                  onChange={(event) => setToWallet(event.target.value)}
                  disabled={busy}
                  error={toWallet !== '' && !walletValid}
                  helperText={
                    toWallet !== '' && !walletValid ? 'Enter a valid 0x address' : ' '
                  }
                  sx={{
                    mt: 2,
                    '& .MuiOutlinedInput-root': { color: 'navbar.primary' },
                    '& .MuiInputLabel-root': { color: 'marketplace.filterButtonText' },
                  }}
                />
                <Box sx={{ display: 'flex', gap: 2, mt: 2, justifyContent: 'flex-end' }}>
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
                    Send
                    {busy && <CircularProgress size={16} sx={{ color: 'inherit', ml: 1 }} />}
                  </Button>
                </Box>
                {busy && (
                  <Typography
                    variant="caption"
                    sx={{ color: 'marketplace.filterButtonText', display: 'block', mt: 1, textAlign: 'right' }}
                  >
                    {step === 'signing' && 'Confirm the transfer in your wallet...'}
                    {step === 'recording' && 'Recording the transfer...'}
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
