'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { useWalletBalance } from 'thirdweb/react';
import Navbar from '@/components/navbar';
import Footer from '@/components/footer';
import { chain, client, usdcAddress } from '@/lib/thirdWebClient';
import { useActiveAccountCompat } from '@/hooks/useActiveAccountCompat';
import {
  explorerTxUrl,
  formatUsdc,
  shortenHex,
} from '@/components/investor/format';
import { useDisplayCurrency } from '@/components/investor/useDisplayCurrency';
import {
  transactionLabel,
  type PortfolioData,
  type PortfolioHoldingDto,
  type PortfolioListingDto,
} from '@/components/portfolio/types';
import SellDialog from '@/components/portfolio/sell-dialog';
import UpdatePriceDialog from '@/components/portfolio/update-price-dialog';
import UnlistDialog from '@/components/portfolio/unlist-dialog';
import TransferDialog from '@/components/portfolio/transfer-dialog';

const HOLDINGS_PAGE_SIZE = 4;
const HISTORY_PAGE_SIZE = 10;

type DialogState =
  | { kind: 'sell'; holding: PortfolioHoldingDto }
  | { kind: 'transfer'; holding: PortfolioHoldingDto }
  | { kind: 'update'; holding: PortfolioHoldingDto; listing: PortfolioListingDto }
  | { kind: 'unlist'; holding: PortfolioHoldingDto; listing: PortfolioListingDto }
  | null;

interface PortfolioViewProps {
  data: PortfolioData;
  loadFailed: boolean;
}

/**
 * Investor portfolio: performance tab (stats plus holdings with sell, update
 * price, unlist and transfer dialogs) and trading history tab, all rendered
 * from server-loaded v_portfolio and ledger data. Dialog completions refresh
 * the server data via router.refresh().
 */
export default function PortfolioView({ data, loadFailed }: PortfolioViewProps) {
  const router = useRouter();
  const account = useActiveAccountCompat();
  const display = useDisplayCurrency();

  const [tab, setTab] = useState(0);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [holdingsShown, setHoldingsShown] = useState(HOLDINGS_PAGE_SIZE);
  const [historyShown, setHistoryShown] = useState(HISTORY_PAGE_SIZE);

  const { data: usdcBalance, isLoading: balanceLoading } = useWalletBalance({
    chain,
    address: account?.address,
    client,
    tokenAddress: usdcAddress,
  });

  const stats = useMemo(() => {
    let invested = 0;
    let current = 0;
    for (const holding of data.holdings) {
      const quantity = holding.quantity;
      if (holding.averageEntryPrice !== null) {
        invested += holding.averageEntryPrice * quantity;
      }
      current += (holding.floorPrice ?? holding.averageEntryPrice ?? 0) * quantity;
    }
    const roi = invested > 0 ? ((current - invested) / invested) * 100 : null;
    return { invested, current, roi };
  }, [data.holdings]);

  const closeDialog = (changed: boolean) => {
    setDialog(null);
    if (changed) {
      router.refresh();
    }
  };

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
      <Container sx={{ pt: 3, flexGrow: 1 }}>
        <Tabs
          value={tab}
          onChange={(_, value: number) => setTab(value)}
          sx={{
            borderBottom: 1,
            borderColor: '#424242',
            width: '100%',
            mb: 4,
            '& .MuiTabs-flexContainer .Mui-selected': { color: 'navbar.primary' },
            '& .MuiTabs-indicator': {
              backgroundColor: 'marketplace.categoryFilter.background',
            },
          }}
        >
          <Tab label="Performance metrics" sx={{ color: '#9E9E9E', flex: 1, maxWidth: '100%' }} />
          <Tab label="Trading history" sx={{ color: '#9E9E9E', flex: 1, maxWidth: '100%' }} />
        </Tabs>

        {loadFailed && (
          <Alert severity="error" sx={{ mb: 3 }}>
            Your portfolio could not be loaded. Please refresh the page to try again.
          </Alert>
        )}

        {tab === 0 && !loadFailed && (
          <>
            <Typography
              style={{ fontWeight: 500 }}
              sx={{ typography: { xs: 'h6', verticalTablet: 'h5' }, color: 'navbar.primary' }}
            >
              General statistics of the portfolio
            </Typography>
            <Box sx={{ mt: 3, display: 'flex', alignItems: 'stretch', gap: 1.5, flexWrap: 'wrap' }}>
              <StatCard
                heading={`${formatUsdc(stats.invested)} USDC`}
                caption={`${display.convert(stats.invested)} ${display.currency}`}
                label="Total invested"
              />
              <StatCard
                heading={`${formatUsdc(stats.current)} USDC`}
                caption={`${display.convert(stats.current)} ${display.currency}`}
                label="Current market value"
              />
              <StatCard
                heading={stats.roi === null ? '-' : `${stats.roi.toFixed(2)}%`}
                label="Unrealized ROI"
              />
              <StatCard
                heading={
                  !account
                    ? '-'
                    : balanceLoading
                      ? '...'
                      : `${Number(usdcBalance?.displayValue ?? '0').toLocaleString('en-US', { maximumFractionDigits: 2 })} ${usdcBalance?.symbol ?? 'USDC'}`
                }
                label="Balance available for reinvestment"
              />
            </Box>

            <Typography
              style={{ fontWeight: 500 }}
              sx={{
                typography: { xs: 'h6', verticalTablet: 'h5' },
                color: 'navbar.primary',
                mt: 6,
              }}
            >
              Your holdings
            </Typography>

            {data.holdings.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 8 }}>
                <Typography variant="h6" sx={{ color: 'navbar.primary' }}>
                  No fractions yet
                </Typography>
                <Typography variant="body2" sx={{ color: 'marketplace.filterButtonText', mt: 1 }}>
                  Buy your first fractions on the marketplace and they will show up here.
                </Typography>
                <Button
                  variant="contained"
                  onClick={() => router.push('/marketplace')}
                  sx={{
                    mt: 3,
                    backgroundColor: 'marketplace.viewMoreButtonBackground',
                    color: 'marketplace.searchButtonText',
                    border: 1,
                    borderColor: 'marketplace.searchButtonBorder',
                    borderRadius: 5,
                    px: 4,
                    py: 1,
                  }}
                >
                  Browse the marketplace
                </Button>
              </Box>
            ) : (
              <>
                {data.holdings.slice(0, holdingsShown).map((holding) => (
                  <HoldingCard
                    key={holding.assetId}
                    holding={holding}
                    onSell={() => setDialog({ kind: 'sell', holding })}
                    onTransfer={() => setDialog({ kind: 'transfer', holding })}
                    onUpdate={(listing) => setDialog({ kind: 'update', holding, listing })}
                    onUnlist={(listing) => setDialog({ kind: 'unlist', holding, listing })}
                    onOpen={() => router.push(`/asset/${holding.assetId}`)}
                  />
                ))}
                {data.holdings.length > holdingsShown && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', mt: 5 }}>
                    <Button
                      onClick={() => setHoldingsShown(holdingsShown + HOLDINGS_PAGE_SIZE)}
                      variant="contained"
                      sx={{
                        backgroundColor: 'marketplace.viewMoreButtonBackground',
                        color: 'marketplace.searchButtonText',
                        border: 1,
                        borderColor: 'marketplace.searchButtonBorder',
                        borderRadius: 5,
                        px: 3,
                        py: 1,
                      }}
                    >
                      View More
                    </Button>
                  </Box>
                )}
              </>
            )}
          </>
        )}

        {tab === 1 && !loadFailed && (
          <>
            <Typography style={{ fontWeight: 500 }} variant="h5" sx={{ color: 'navbar.primary' }}>
              Trading history
            </Typography>
            {data.transactions.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 8 }}>
                <Typography variant="h6" sx={{ color: 'navbar.primary' }}>
                  No transactions yet
                </Typography>
                <Typography variant="body2" sx={{ color: 'marketplace.filterButtonText', mt: 1 }}>
                  Purchases, sales, listings and transfers will appear here.
                </Typography>
              </Box>
            ) : (
              <>
                <TableContainer sx={{ mt: 3, overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <HeaderCell>Date</HeaderCell>
                        <HeaderCell>Type</HeaderCell>
                        <HeaderCell>Asset</HeaderCell>
                        <HeaderCell>Category</HeaderCell>
                        <HeaderCell align="right">Fractions</HeaderCell>
                        <HeaderCell align="right">Price (USDC)</HeaderCell>
                        <HeaderCell align="right">Total ({display.currency})</HeaderCell>
                        <HeaderCell align="right">Tx</HeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.transactions.slice(0, historyShown).map((tx) => {
                        const explorer = explorerTxUrl(tx.txHash);
                        const total =
                          tx.total ??
                          (tx.quantity !== null && tx.pricePerFraction !== null
                            ? tx.quantity * tx.pricePerFraction
                            : null);
                        return (
                          <TableRow key={tx.id}>
                            <BodyCell>
                              {new Date(tx.createdAt).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </BodyCell>
                            <BodyCell>{transactionLabel(tx)}</BodyCell>
                            <BodyCell>{tx.assetName}</BodyCell>
                            <BodyCell>{tx.categoryName ?? '-'}</BodyCell>
                            <BodyCell align="right">{tx.quantity ?? '-'}</BodyCell>
                            <BodyCell align="right">
                              {tx.pricePerFraction === null ? '-' : formatUsdc(tx.pricePerFraction)}
                            </BodyCell>
                            <BodyCell align="right">
                              {total === null ? '-' : display.convert(total)}
                            </BodyCell>
                            <BodyCell align="right">
                              {explorer ? (
                                <a
                                  href={explorer}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ color: '#C6FF00' }}
                                >
                                  {shortenHex(tx.txHash)}
                                </a>
                              ) : (
                                '-'
                              )}
                            </BodyCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
                {data.transactions.length > historyShown && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                    <Button
                      onClick={() => setHistoryShown(historyShown + HISTORY_PAGE_SIZE)}
                      variant="contained"
                      sx={{
                        backgroundColor: 'marketplace.viewMoreButtonBackground',
                        color: 'marketplace.searchButtonText',
                        border: 1,
                        borderColor: 'marketplace.searchButtonBorder',
                        borderRadius: 5,
                        px: 3,
                        py: 1,
                      }}
                    >
                      View More
                    </Button>
                  </Box>
                )}
              </>
            )}
          </>
        )}
      </Container>
      <Divider sx={{ backgroundColor: 'divider', mt: 8 }} />
      <Footer />

      {dialog?.kind === 'sell' && (
        <SellDialog holding={dialog.holding} open onClose={closeDialog} />
      )}
      {dialog?.kind === 'transfer' && (
        <TransferDialog holding={dialog.holding} open onClose={closeDialog} />
      )}
      {dialog?.kind === 'update' && (
        <UpdatePriceDialog
          holding={dialog.holding}
          listing={dialog.listing}
          open
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'unlist' && (
        <UnlistDialog
          holding={dialog.holding}
          listing={dialog.listing}
          open
          onClose={closeDialog}
        />
      )}
    </Box>
  );
}

function StatCard({
  heading,
  label,
  caption,
}: {
  heading: string;
  label: string;
  caption?: string;
}) {
  return (
    <Box
      sx={{
        flex: 1,
        px: { xs: 1.5, sm: 3 },
        py: { xs: 2, sm: 4 },
        backgroundColor: 'navbar.background',
        border: 1,
        borderColor: 'border',
        borderRadius: '10px',
        flexBasis: { xs: '100%', sm: '23%' },
        minWidth: { sm: '180px' },
      }}
    >
      <Typography
        style={{ fontWeight: 700 }}
        sx={{ typography: { xs: 'subtitle1', sm: 'h6' }, color: 'navbar.primary' }}
      >
        {heading}
      </Typography>
      {caption && (
        <Typography variant="caption" sx={{ color: 'marketplace.filterButtonText' }}>
          {caption}
        </Typography>
      )}
      <Typography
        sx={{ typography: { xs: 'subtitle2', sm: 'subtitle1' }, color: 'portfolio.secondaryText' }}
      >
        {label}
      </Typography>
    </Box>
  );
}

function HoldingCard({
  holding,
  onSell,
  onTransfer,
  onUpdate,
  onUnlist,
  onOpen,
}: {
  holding: PortfolioHoldingDto;
  onSell: () => void;
  onTransfer: () => void;
  onUpdate: (listing: PortfolioListingDto) => void;
  onUnlist: (listing: PortfolioListingDto) => void;
  onOpen: () => void;
}) {
  const available = holding.quantity - holding.lockedQuantity;
  const marketPrice = holding.floorPrice ?? holding.averageEntryPrice;
  const marketValue = marketPrice === null ? null : marketPrice * holding.quantity;
  const invested =
    holding.averageEntryPrice === null ? null : holding.averageEntryPrice * holding.quantity;
  const roi =
    invested !== null && invested > 0 && marketValue !== null
      ? ((marketValue - invested) / invested) * 100
      : null;

  return (
    <Box
      data-testid="portfolio-holding"
      sx={{
        mt: 3,
        display: 'flex',
        gap: { xs: 2, sm: 3 },
        flexDirection: { xs: 'column', sm: 'row' },
        backgroundColor: 'assetPurchase.documentRedirectBackground',
        borderRadius: '10px',
        p: { xs: 2, verticalTablet: 3 },
      }}
    >
      <Box sx={{ width: { xs: '100%', sm: 220 }, flexShrink: 0 }}>
        <Box
          onClick={onOpen}
          sx={{
            position: 'relative',
            height: 150,
            borderRadius: 2,
            overflow: 'hidden',
            cursor: 'pointer',
            backgroundColor: 'marketplace.filterMenuBackground',
          }}
        >
          {holding.imageUrl && (
            <Image
              src={holding.imageUrl}
              alt={holding.assetName}
              fill
              sizes="(max-width: 600px) 100vw, 220px"
              style={{ objectFit: 'cover' }}
            />
          )}
        </Box>
        <Typography
          variant="subtitle1"
          onClick={onOpen}
          sx={{ color: 'navbar.primary', fontWeight: 600, mt: 1, cursor: 'pointer' }}
        >
          {holding.assetName}
        </Typography>
        <Typography variant="caption" sx={{ color: 'marketplace.filterButtonText' }}>
          {holding.categoryName ?? ''}
          {holding.businessDisplayName ? ` by ${holding.businessDisplayName}` : ''}
        </Typography>
      </Box>

      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <HoldingStat
            heading={`${holding.quantity}${holding.totalSupply ? ` / ${holding.totalSupply}` : ''}`}
            label="Fractions owned"
          />
          <HoldingStat
            heading={
              holding.averageEntryPrice === null
                ? '-'
                : `${formatUsdc(holding.averageEntryPrice)} USDC`
            }
            label="Average entry price"
          />
          <HoldingStat
            heading={marketValue === null ? '-' : `${formatUsdc(marketValue)} USDC`}
            label="Current market value"
          />
          <HoldingStat heading={roi === null ? '-' : `${roi.toFixed(2)}%`} label="ROI" />
        </Box>

        {holding.openListings.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" sx={{ color: 'marketplace.filterButtonText' }}>
              Open listings
            </Typography>
            {holding.openListings.map((listing) => (
              <Box
                key={listing.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  flexWrap: 'wrap',
                  mt: 1,
                  p: 1.5,
                  backgroundColor: 'marketplace.categoryFilter.text',
                  border: 1,
                  borderColor: 'assetPurchase.documentRedirectBorder',
                  borderRadius: '5px',
                }}
              >
                <Chip
                  size="small"
                  label={listing.kind === 'primary' ? 'Primary' : 'Resale'}
                  sx={{
                    backgroundColor: 'navbar.background',
                    color: 'navbar.primary',
                    border: 1,
                    borderColor: 'border',
                  }}
                />
                <Typography variant="body2" sx={{ color: 'navbar.primary', flexGrow: 1 }}>
                  {listing.quantity} fraction{listing.quantity > 1 ? 's' : ''} at{' '}
                  {formatUsdc(listing.pricePerFraction)} USDC
                </Typography>
                <Button size="small" onClick={() => onUpdate(listing)} sx={actionButtonSx}>
                  Update price
                </Button>
                <Button size="small" onClick={() => onUnlist(listing)} sx={actionButtonSx}>
                  Unlist
                </Button>
              </Box>
            ))}
          </Box>
        )}

        <Box sx={{ display: 'flex', gap: 1.5, mt: 2, flexWrap: 'wrap' }}>
          <Button
            onClick={onSell}
            disabled={available < 1 || holding.nftId === null}
            sx={{ ...actionButtonSx, px: 3 }}
          >
            Sell
          </Button>
          <Button
            onClick={onTransfer}
            disabled={available < 1 || !holding.erc20TokenAddress}
            sx={{ ...actionButtonSx, px: 3 }}
          >
            Send fractions
          </Button>
          {available < 1 && holding.lockedQuantity > 0 && (
            <Typography
              variant="caption"
              sx={{ color: 'marketplace.filterButtonText', alignSelf: 'center' }}
            >
              All fractions are locked in open listings.
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}

const actionButtonSx = {
  borderRadius: '40px',
  backgroundColor: 'marketplace.viewMoreButtonBackground',
  color: 'listingCard.buttonText',
  border: 1,
  borderColor: 'marketplace.searchButtonBorder',
  textTransform: 'none',
  px: 2,
  '&.Mui-disabled': { opacity: 0.5, color: 'listingCard.buttonText' },
} as const;

function HoldingStat({ heading, label }: { heading: string; label: string }) {
  return (
    <Box
      sx={{
        flex: 1,
        p: 1.5,
        backgroundColor: 'marketplace.categoryFilter.text',
        border: 1,
        borderColor: 'assetPurchase.documentRedirectBorder',
        borderRadius: '5px',
        minWidth: { xs: '45%', sm: '22%' },
      }}
    >
      <Typography variant="subtitle2" sx={{ color: 'navbar.primary', fontWeight: 600 }}>
        {heading}
      </Typography>
      <Typography variant="caption" sx={{ color: 'assetPurchase.documentRedirectSecondaryText' }}>
        {label}
      </Typography>
    </Box>
  );
}

function HeaderCell({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: 'right';
}) {
  return (
    <TableCell
      align={align}
      sx={{ color: 'portfolio.tableText', fontWeight: 600, borderColor: 'divider' }}
    >
      {children}
    </TableCell>
  );
}

function BodyCell({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: 'right';
}) {
  return (
    <TableCell align={align} sx={{ color: 'portfolio.tableText', borderColor: 'divider' }}>
      {children}
    </TableCell>
  );
}
