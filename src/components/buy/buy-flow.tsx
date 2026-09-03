'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Divider,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { useConnectModal } from 'thirdweb/react';
import Navbar from '@/components/navbar';
import Footer from '@/components/footer';
import { connectWalletConfig } from '@/utils/thirdwebConfig';
import { useActiveAccountCompat } from '@/hooks/useActiveAccountCompat';
import type { MarketplaceAssetRow } from '@/lib/db/assets';
import type { ListingRow } from '@/lib/db/listings';
import type { OrderRow } from '@/lib/db/orders';
import {
  createBuyOrder,
  failOrder,
  getOrderStatus,
  submitOrderTx,
  type PaymentMethod,
} from '@/actions/orders';
import {
  approveUsdcSpend,
  buyFractionsOnChain,
  chainErrorMessage,
  toMicroUsdcUnits,
} from '@/components/investor/chain';
import {
  explorerTxUrl,
  formatUsdc,
  metadataImageUrls,
  parseAmount,
} from '@/components/investor/format';
import { useDisplayCurrency } from '@/components/investor/useDisplayCurrency';
import type { ViewerState } from '@/components/asset-detail/asset-detail-view';
import OrderTimeline, { type TimelineStep } from '@/components/buy/order-timeline';

type PayTab = 'usdc' | 'swap' | 'card';

type Phase =
  | 'review'
  | 'quoting'
  | 'starting_onramp'
  | 'awaiting_funds'
  | 'approving'
  | 'buying'
  | 'submitting'
  | 'settling'
  | 'settled'
  | 'failed';

interface BuyFlowProps {
  asset: MarketplaceAssetRow;
  listings: ListingRow[];
  quantity: number;
  viewer: ViewerState;
}

interface OrderTotals {
  /** Order total before fee, USDC units (decimal string). */
  total: string;
  /** Platform fee, USDC units (decimal string). */
  platformFee: string;
}

const SETTLE_POLL_INTERVAL_MS = 4000;
const SETTLE_POLL_ATTEMPTS = 45;
const ONRAMP_POLL_INTERVAL_MS = 4000;
const ONRAMP_POLL_ATTEMPTS = 150;

const FAILURE_REASON_MESSAGES: Record<string, string> = {
  onramp_failed: 'The card payment failed or was declined.',
  onramp_canceled: 'The card payment was canceled.',
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isQuoteExpired(order: OrderRow): boolean {
  if (!order.expires_at) {
    return false;
  }
  return Date.now() > new Date(order.expires_at).getTime();
}

function readableFailure(reason: string | null): string {
  if (!reason) {
    return 'The order failed.';
  }
  return FAILURE_REASON_MESSAGES[reason] ?? reason;
}

/**
 * Investor checkout: USDC (approve then buyFractions with the smart
 * account), Swap (coming soon) and Card (fiat on-ramp: order to
 * awaiting_funds, provider redirect, poll until funded, then the same
 * approve plus buy path). Every quote and gate is re-checked server side by
 * createBuyOrder; failures render a message with retry per the order state
 * machine, and the timeline mirrors the order status.
 */
export default function BuyFlow({ asset, listings, quantity, viewer }: BuyFlowProps) {
  const router = useRouter();
  const account = useActiveAccountCompat();
  const { connect } = useConnectModal();
  const display = useDisplayCurrency();

  const [tab, setTab] = useState<PayTab>('usdc');
  const [phase, setPhase] = useState<Phase>('review');
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [totals, setTotals] = useState<OrderTotals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settledTxHash, setSettledTxHash] = useState<string | null>(null);
  const [settlingSlow, setSettlingSlow] = useState(false);
  const [onrampUrl, setOnrampUrl] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const kycBlocked = Boolean(asset.kyc_required) && viewer.loggedIn && !viewer.kycApproved;
  const imageUrl = metadataImageUrls(asset.metadata)[0] ?? null;

  // Local estimate only; the server requotes in createBuyOrder.
  const estimate = listings.reduce(
    (acc, listing) => {
      if (acc.remaining <= 0) {
        return acc;
      }
      const take = Math.min(acc.remaining, listing.quantity);
      return {
        remaining: acc.remaining - take,
        total: acc.total + take * parseAmount(listing.price_per_fraction),
      };
    },
    { remaining: quantity, total: 0 },
  ).total;

  const busy =
    phase === 'quoting' ||
    phase === 'starting_onramp' ||
    phase === 'awaiting_funds' ||
    phase === 'approving' ||
    phase === 'buying' ||
    phase === 'submitting' ||
    phase === 'settling';

  const fail = useCallback((message: string) => {
    if (cancelledRef.current) {
      return;
    }
    setError(message);
    setPhase('failed');
  }, []);

  const reset = () => {
    setPhase('review');
    setOrder(null);
    setTotals(null);
    setError(null);
    setSettledTxHash(null);
    setSettlingSlow(false);
    setOnrampUrl(null);
  };

  /** Polls the order until the indexer settles it (or it fails). */
  const pollSettlement = useCallback(
    async (orderId: string) => {
      setPhase('settling');
      for (let attempt = 0; attempt < SETTLE_POLL_ATTEMPTS; attempt++) {
        await sleep(SETTLE_POLL_INTERVAL_MS);
        if (cancelledRef.current) {
          return;
        }
        const status = await getOrderStatus(orderId);
        if (!status.ok) {
          continue;
        }
        if (status.data.status === 'settled') {
          setSettledTxHash(status.data.tx_hash);
          setPhase('settled');
          return;
        }
        if (status.data.status === 'failed') {
          fail(readableFailure(status.data.failure_reason));
          return;
        }
        if (status.data.status === 'expired') {
          fail('The order expired before it could settle. Please try again.');
          return;
        }
      }
      // The tx is on chain; the indexer just has not caught up yet.
      setSettlingSlow(true);
    },
    [fail],
  );

  /** Approve plus buyFractions, then submitOrderTx. Shared by USDC and card. */
  const executePurchase = useCallback(
    async (activeOrder: OrderRow, orderTotals: OrderTotals) => {
      if (!account) {
        fail('Wallet is not connected.');
        return;
      }
      if (asset.nft_id === null) {
        fail('Asset is not live on chain yet.');
        return;
      }
      // A funded order proceeds even past the quote TTL (the money already
      // arrived); the chain reverts if the book moved, which is handled below.
      if (activeOrder.status !== 'funded' && isQuoteExpired(activeOrder)) {
        await failOrder(activeOrder.id, 'Quote expired before the purchase was sent');
        fail('The quote expired. Please start the purchase again.');
        return;
      }

      let txHash: string;
      try {
        setPhase('approving');
        const approveAmount =
          toMicroUsdcUnits(orderTotals.total) + toMicroUsdcUnits(orderTotals.platformFee);
        await approveUsdcSpend(account, approveAmount);

        setPhase('buying');
        txHash = await buyFractionsOnChain(account, asset.nft_id, quantity);
      } catch (chainError) {
        const message = chainErrorMessage(chainError);
        await failOrder(activeOrder.id, message).catch(() => null);
        fail(message);
        return;
      }

      setPhase('submitting');
      const submitted = await submitOrderTx(activeOrder.id, txHash);
      if (!submitted.ok) {
        // The chain purchase went through; the indexer will still settle it.
        fail(
          `The purchase transaction was sent (${txHash.slice(0, 10)}...) but reporting it failed: ${submitted.error.message}. Check your portfolio in a minute.`,
        );
        return;
      }
      setOrder(submitted.data);
      await pollSettlement(submitted.data.id);
    },
    [account, asset.nft_id, quantity, fail, pollSettlement],
  );

  /** Card path: create the on-ramp session and poll until the order is funded. */
  const runOnramp = useCallback(
    async (activeOrder: OrderRow, orderTotals: OrderTotals) => {
      setPhase('starting_onramp');
      let sessionId: string;
      try {
        const response = await fetch('/api/onramp/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: activeOrder.id, fiatCurrency: display.currency }),
        });
        const body = (await response.json()) as
          | { ok: true; data: { sessionId: string; redirectUrl: string | null } }
          | { ok: false; error: { code: string; message: string } };
        if (!body.ok) {
          fail(body.error.message);
          return;
        }
        sessionId = body.data.sessionId;
        if (body.data.redirectUrl) {
          setOnrampUrl(body.data.redirectUrl);
          window.open(body.data.redirectUrl, '_blank', 'noopener');
        }
      } catch {
        fail('Could not start the card payment. Please try again.');
        return;
      }

      setPhase('awaiting_funds');
      for (let attempt = 0; attempt < ONRAMP_POLL_ATTEMPTS; attempt++) {
        await sleep(ONRAMP_POLL_INTERVAL_MS);
        if (cancelledRef.current) {
          return;
        }
        let body:
          | { ok: true; data: { status: string; orderStatus: string | null; failureReason: string | null } }
          | { ok: false; error: { code: string; message: string } };
        try {
          const response = await fetch(
            `/api/onramp/status?sessionId=${encodeURIComponent(sessionId)}`,
            { cache: 'no-store' },
          );
          body = (await response.json()) as typeof body;
        } catch {
          continue;
        }
        if (!body.ok) {
          continue;
        }
        if (body.data.orderStatus === 'funded') {
          await executePurchase({ ...activeOrder, status: 'funded' }, orderTotals);
          return;
        }
        if (
          body.data.status === 'failed' ||
          body.data.status === 'canceled' ||
          body.data.orderStatus === 'failed'
        ) {
          fail(readableFailure(body.data.failureReason ?? `onramp_${body.data.status}`));
          return;
        }
        if (body.data.orderStatus === 'expired') {
          fail('The order expired while waiting for the payment. Please try again.');
          return;
        }
      }
      fail('Timed out waiting for the card payment. If you completed it, check your portfolio.');
    },
    [display.currency, executePurchase, fail],
  );

  const startPurchase = async (method: PaymentMethod) => {
    if (!account) {
      try {
        await connect(connectWalletConfig());
      } catch {
        return;
      }
      return;
    }
    setError(null);
    setPhase('quoting');

    const created = await createBuyOrder(asset.asset_id as string, quantity, method);
    if (!created.ok) {
      if (created.error.code === 'kyc_required') {
        fail('This asset requires identity verification before buying.');
      } else if (created.error.code === 'conflict') {
        fail(created.error.message);
      } else {
        fail(created.error.message);
      }
      return;
    }

    const { order: newOrder, total, platformFee } = created.data;
    const orderTotals: OrderTotals = { total, platformFee };
    setOrder(newOrder);
    setTotals(orderTotals);

    if (method === 'card') {
      await runOnramp(newOrder, orderTotals);
    } else {
      await executePurchase(newOrder, orderTotals);
    }
  };

  const cancelOnramp = async () => {
    if (order) {
      await failOrder(order.id, 'Canceled by the buyer before payment').catch(() => null);
    }
    reset();
  };

  const timelineSteps = buildTimeline(phase, tab === 'card');
  const orderTotal = totals ? parseAmount(totals.total) : estimate;
  const orderFee = totals ? parseAmount(totals.platformFee) : null;
  const grandTotal = orderFee === null ? orderTotal : orderTotal + orderFee;

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
      <Container sx={{ flexGrow: 1, py: { xs: 2, sm: 4 }, maxWidth: 'md' }}>
        <Typography variant="h5" sx={{ color: 'navbar.primary', fontWeight: 500 }}>
          Checkout
        </Typography>

        <Box
          sx={{
            mt: 3,
            display: 'flex',
            gap: { xs: 3, verticalTablet: 4 },
            flexDirection: { xs: 'column', verticalTablet: 'row' },
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box
              sx={{
                backgroundColor: 'listingCard.background',
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              {imageUrl && (
                <Box sx={{ position: 'relative', height: 200 }}>
                  <Image
                    src={imageUrl}
                    alt={asset.name ?? 'Asset image'}
                    fill
                    sizes="(max-width: 768px) 100vw, 40vw"
                    style={{ objectFit: 'cover' }}
                  />
                </Box>
              )}
              <Box sx={{ p: 2 }}>
                <Typography variant="subtitle1" sx={{ color: 'listingCard.text', fontWeight: 500 }}>
                  {asset.name ?? 'Untitled asset'}
                </Typography>
                <Typography variant="body2" sx={{ color: 'marketplace.filterButtonText' }}>
                  {asset.category_name ?? ''}
                </Typography>
                <SummaryRow label="Fractions" value={String(quantity)} />
                <SummaryRow label="Subtotal" value={`${formatUsdc(orderTotal)} USDC`} />
                <SummaryRow
                  label="Platform fee"
                  value={orderFee === null ? 'Added at confirmation' : `${formatUsdc(orderFee)} USDC`}
                />
                <SummaryRow
                  label="Total"
                  value={`${formatUsdc(grandTotal)} USDC`}
                  emphasized
                />
                <Typography variant="caption" sx={{ color: 'marketplace.filterButtonText' }}>
                  About {display.convert(grandTotal)} {display.currency}
                </Typography>
              </Box>
            </Box>
          </Box>

          <Box sx={{ flex: 1.4, minWidth: 0 }}>
            {kycBlocked ? (
              <Alert
                severity="warning"
                action={
                  <Button
                    color="inherit"
                    size="small"
                    onClick={() => {
                      try {
                        localStorage.setItem(
                          'redirectUrl',
                          `/asset/${asset.asset_id}/buy/${quantity}`,
                        );
                      } catch {
                        // Storage can be unavailable; the CTA still works.
                      }
                      router.push('/verify');
                    }}
                  >
                    Verify identity
                  </Button>
                }
              >
                This asset requires identity verification before buying.
              </Alert>
            ) : (
              <>
                <Tabs
                  value={tab}
                  onChange={(_, value: PayTab) => {
                    if (!busy) {
                      setTab(value);
                      setError(null);
                      if (phase === 'failed') {
                        reset();
                      }
                    }
                  }}
                  sx={{
                    borderBottom: 1,
                    borderColor: 'divider',
                    '& .MuiTabs-flexContainer .Mui-selected': { color: 'navbar.primary' },
                    '& .MuiTabs-indicator': {
                      backgroundColor: 'marketplace.categoryFilter.background',
                    },
                  }}
                >
                  <Tab value="usdc" label="USDC" sx={{ color: '#9E9E9E', flex: 1 }} />
                  <Tab value="swap" label="Swap" sx={{ color: '#9E9E9E', flex: 1 }} />
                  <Tab value="card" label="Card" sx={{ color: '#9E9E9E', flex: 1 }} />
                </Tabs>

                {tab === 'swap' ? (
                  <Alert severity="info" sx={{ mt: 3 }}>
                    Paying with other tokens (swap) is coming soon. Use USDC or card in the
                    meantime.
                  </Alert>
                ) : (
                  <Box sx={{ mt: 3 }}>
                    {phase === 'review' && (
                      <>
                        <Typography variant="body2" sx={{ color: 'marketplace.filterButtonText' }}>
                          {tab === 'usdc'
                            ? 'Pay with USDC from your wallet. You will approve the amount and confirm the purchase.'
                            : 'Pay with a card. Your USDC arrives through the payment provider, then the purchase runs automatically.'}
                        </Typography>
                        <Button
                          fullWidth
                          variant="contained"
                          onClick={() => startPurchase(tab === 'card' ? 'card' : 'usdc')}
                          sx={{
                            mt: 3,
                            backgroundColor: 'marketplace.viewMoreButtonBackground',
                            color: 'marketplace.searchButtonText',
                            border: 1,
                            borderColor: 'marketplace.searchButtonBorder',
                            borderRadius: 5,
                            py: 1.2,
                          }}
                        >
                          {account
                            ? tab === 'card'
                              ? 'Pay with card'
                              : 'Buy with USDC'
                            : 'Connect wallet to continue'}
                        </Button>
                      </>
                    )}

                    {phase !== 'review' && phase !== 'failed' && (
                      <OrderTimeline steps={timelineSteps} />
                    )}

                    {phase === 'awaiting_funds' && (
                      <Box sx={{ mt: 2 }}>
                        <Alert severity="info">
                          Complete the payment in the provider tab. This page updates
                          automatically once the funds arrive.
                        </Alert>
                        <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                          {onrampUrl && (
                            <Button
                              size="small"
                              onClick={() => window.open(onrampUrl, '_blank', 'noopener')}
                              sx={{ color: 'marketplace.filterButtonText' }}
                            >
                              Reopen payment page
                            </Button>
                          )}
                          <Button
                            size="small"
                            onClick={cancelOnramp}
                            sx={{ color: 'marketplace.filterButtonText' }}
                          >
                            Cancel payment
                          </Button>
                        </Box>
                      </Box>
                    )}

                    {phase === 'settling' && settlingSlow && (
                      <Alert severity="info" sx={{ mt: 2 }}>
                        The purchase transaction is on chain but settlement is taking longer
                        than usual. Your fractions will appear in your portfolio shortly.
                        <Button
                          size="small"
                          onClick={() => router.push('/portfolio')}
                          sx={{ ml: 1, color: 'inherit' }}
                        >
                          Go to portfolio
                        </Button>
                      </Alert>
                    )}

                    {phase === 'settled' && (
                      <Box sx={{ mt: 3, textAlign: 'center' }}>
                        <Typography variant="h6" sx={{ color: 'navbar.primary', fontWeight: 500 }}>
                          Purchase complete
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{ color: 'marketplace.filterButtonText', mt: 1 }}
                        >
                          {quantity} fraction{quantity > 1 ? 's' : ''} of{' '}
                          {asset.name ?? 'this asset'} now belong to you.
                        </Typography>
                        {settledTxHash && explorerTxUrl(settledTxHash) && (
                          <Typography variant="body2" sx={{ mt: 1 }}>
                            <a
                              href={explorerTxUrl(settledTxHash) as string}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: '#C6FF00' }}
                            >
                              View transaction
                            </a>
                          </Typography>
                        )}
                        <Button
                          variant="contained"
                          onClick={() => router.push('/portfolio')}
                          sx={{
                            mt: 3,
                            backgroundColor: 'marketplace.viewMoreButtonBackground',
                            color: 'marketplace.searchButtonText',
                            border: 1,
                            borderColor: 'marketplace.searchButtonBorder',
                            borderRadius: 5,
                            py: 1,
                            px: 4,
                          }}
                        >
                          Go to portfolio
                        </Button>
                      </Box>
                    )}

                    {phase === 'failed' && (
                      <Box sx={{ mt: 2 }}>
                        <Alert severity="error">{error ?? 'The purchase failed.'}</Alert>
                        <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                          <Button
                            variant="contained"
                            onClick={reset}
                            sx={{
                              backgroundColor: 'marketplace.viewMoreButtonBackground',
                              color: 'marketplace.searchButtonText',
                              border: 1,
                              borderColor: 'marketplace.searchButtonBorder',
                              borderRadius: 5,
                              px: 3,
                            }}
                          >
                            Try again
                          </Button>
                          <Button
                            onClick={() => router.push(`/asset/${asset.asset_id}`)}
                            sx={{ color: 'marketplace.filterButtonText' }}
                          >
                            Back to asset
                          </Button>
                        </Box>
                      </Box>
                    )}

                    {busy && phase !== 'awaiting_funds' && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 2 }}>
                        <CircularProgress size={18} sx={{ color: '#C6FF00' }} />
                        <Typography
                          variant="body2"
                          sx={{ color: 'marketplace.filterButtonText' }}
                        >
                          {phase === 'quoting' && 'Preparing your order...'}
                          {phase === 'starting_onramp' && 'Starting the card payment...'}
                          {phase === 'approving' && 'Approve the USDC spend in your wallet...'}
                          {phase === 'buying' && 'Confirm the purchase in your wallet...'}
                          {phase === 'submitting' && 'Recording the transaction...'}
                          {phase === 'settling' && 'Waiting for on-chain settlement...'}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                )}
              </>
            )}
          </Box>
        </Box>
      </Container>
      <Divider sx={{ backgroundColor: 'divider' }} />
      <Footer />
    </Box>
  );
}

function buildTimeline(phase: Phase, isCard: boolean): TimelineStep[] {
  const order: Array<{ key: string; label: string; phases: Phase[] }> = [
    { key: 'created', label: 'Order created', phases: ['quoting'] },
    ...(isCard
      ? [
          {
            key: 'awaiting',
            label: 'Awaiting funds',
            phases: ['starting_onramp', 'awaiting_funds'] as Phase[],
          },
          { key: 'funded', label: 'Funded', phases: [] as Phase[] },
        ]
      : []),
    { key: 'purchase', label: 'Purchase sent', phases: ['approving', 'buying'] },
    { key: 'submitted', label: 'Submitted', phases: ['submitting'] },
    { key: 'settled', label: 'Settled', phases: ['settling'] },
  ];

  const activeIndex = order.findIndex((step) => step.phases.includes(phase));
  const done = phase === 'settled';

  return order.map((step, index) => {
    let state: TimelineStep['state'];
    if (done) {
      state = 'done';
    } else if (activeIndex === -1) {
      state = 'pending';
    } else if (index < activeIndex) {
      state = 'done';
    } else if (index === activeIndex) {
      state = 'active';
    } else {
      state = 'pending';
    }
    return { label: step.label, state };
  });
}

function SummaryRow({
  label,
  value,
  emphasized,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        mt: 1.5,
        pb: 0.5,
        borderBottom: 1,
        borderColor: 'assetPurchase.documentRedirectBorder',
      }}
    >
      <Typography variant="body2" sx={{ color: 'marketplace.filterButtonText' }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{ color: 'navbar.primary', fontWeight: emphasized ? 700 : 500 }}
      >
        {value}
      </Typography>
    </Box>
  );
}
