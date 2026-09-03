'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Container,
  Divider,
  Slider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { Carousel } from 'react-responsive-carousel';
import 'react-responsive-carousel/lib/styles/carousel.min.css';
import { useConnectModal } from 'thirdweb/react';
import Navbar from '@/components/navbar';
import Footer from '@/components/footer';
import { connectWalletConfig } from '@/utils/thirdwebConfig';
import type { MarketplaceAssetRow } from '@/lib/db/assets';
import type { ListingRow } from '@/lib/db/listings';
import {
  asMetadataObject,
  formatUsdc,
  metadataDocumentGroups,
  metadataImageUrls,
  parseAmount,
} from '@/components/investor/format';
import { useDisplayCurrency } from '@/components/investor/useDisplayCurrency';

export interface ViewerState {
  loggedIn: boolean;
  kycApproved: boolean;
  /** True when the viewer is the business that minted this asset. */
  isOwner: boolean;
}

export interface SellerName {
  id: string;
  name: string | null;
  display_name: string | null;
}

interface AssetDetailViewProps {
  asset: MarketplaceAssetRow;
  listings: ListingRow[];
  viewer: ViewerState;
  sellers: SellerName[];
}

const RESERVED_METADATA_KEYS = new Set([
  'nftName',
  'imageUrls',
  'documentUrls',
  'description',
  'assetClass',
]);

function labelFromKey(key: string): string {
  const spaced = key.replace(/([A-Z])/g, ' $1').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export default function AssetDetailView({
  asset,
  listings,
  viewer,
  sellers,
}: AssetDetailViewProps) {
  const router = useRouter();
  const { connect } = useConnectModal();
  const display = useDisplayCurrency();

  const [quantity, setQuantity] = useState(1);

  const comingSoon = asset.status === 'draft' || asset.status === 'minting';
  const images = metadataImageUrls(asset.metadata);
  const documentGroups = metadataDocumentGroups(asset.metadata);
  const listedQuantity = listings.reduce((sum, listing) => sum + listing.quantity, 0);
  const maxBuyable = Math.max(listedQuantity, 0);
  const kycBlocked = Boolean(asset.kyc_required) && viewer.loggedIn && !viewer.kycApproved;

  const sellerNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const seller of sellers) {
      const name = seller.display_name ?? seller.name;
      if (name) {
        map.set(seller.id, name);
      }
    }
    return map;
  }, [sellers]);

  const attributes = useMemo(() => {
    const entries: Array<{ label: string; value: string }> = [];
    for (const [key, value] of Object.entries(asMetadataObject(asset.metadata))) {
      if (RESERVED_METADATA_KEYS.has(key)) {
        continue;
      }
      if (typeof value === 'string' && value.trim() !== '') {
        entries.push({ label: labelFromKey(key), value });
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        entries.push({ label: labelFromKey(key), value: String(value) });
      }
    }
    return entries;
  }, [asset.metadata]);

  // Mirrors the server quote: fills from active listings cheapest first (the
  // repository already sorts them). The server requotes in createBuyOrder.
  const subtotal = useMemo(() => {
    let remaining = quantity;
    let total = 0;
    for (const listing of listings) {
      if (remaining <= 0) {
        break;
      }
      const take = Math.min(remaining, listing.quantity);
      total += take * parseAmount(listing.price_per_fraction);
      remaining -= take;
    }
    return total;
  }, [listings, quantity]);

  const startPurchase = () => {
    if (!viewer.loggedIn) {
      connect(connectWalletConfig());
      return;
    }
    if (kycBlocked) {
      return;
    }
    router.push(`/asset/${asset.asset_id}/buy/${quantity}`);
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
      <Container sx={{ flexGrow: 1, py: { xs: 2, sm: 4 } }}>
        <Box
          sx={{
            display: 'flex',
            gap: { xs: 3, verticalTablet: 5 },
            flexDirection: { xs: 'column', verticalTablet: 'row' },
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {images.length > 0 ? (
              <Box sx={{ '& .carousel .thumb': { borderColor: 'border' } }}>
                <Carousel
                  showArrows={false}
                  showStatus={false}
                  showIndicators={false}
                  preventMovementUntilSwipeScrollTolerance
                >
                  {images.map((url) => (
                    <Box key={url} sx={{ position: 'relative', height: { xs: 260, sm: 400 } }}>
                      <Image
                        src={url}
                        alt={asset.name ?? 'Asset image'}
                        fill
                        sizes="(max-width: 768px) 100vw, 50vw"
                        style={{ objectFit: 'cover', borderRadius: '12px' }}
                      />
                    </Box>
                  ))}
                </Carousel>
              </Box>
            ) : (
              <Box
                sx={{
                  height: { xs: 260, sm: 400 },
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'marketplace.filterMenuBackground',
                  borderRadius: '12px',
                }}
              >
                <Typography sx={{ color: 'marketplace.filterButtonText' }}>
                  Images coming soon
                </Typography>
              </Box>
            )}

            {attributes.length > 0 && (
              <Box sx={{ mt: 4 }}>
                <Typography variant="h6" sx={{ color: 'navbar.primary', fontWeight: 500 }}>
                  Details
                </Typography>
                <Box sx={{ mt: 1.5 }}>
                  {attributes.map((attribute) => (
                    <Box
                      key={attribute.label}
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        borderBottom: 1,
                        borderColor: 'assetPurchase.documentRedirectBorder',
                        py: 1,
                      }}
                    >
                      <Typography variant="body2" sx={{ color: 'marketplace.filterButtonText' }}>
                        {attribute.label}
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'navbar.primary', fontWeight: 500 }}>
                        {attribute.value}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {documentGroups.length > 0 && (
              <Box
                onClick={() => router.push(`/asset/${asset.asset_id}/docs`)}
                sx={{
                  mt: 3,
                  p: 2,
                  backgroundColor: 'assetPurchase.documentRedirectBackground',
                  border: 1,
                  borderColor: 'assetPurchase.documentRedirectBorder',
                  borderRadius: 2,
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Box>
                  <Typography variant="subtitle1" sx={{ color: 'navbar.primary', fontWeight: 500 }}>
                    Ownership documents
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ color: 'assetPurchase.documentRedirectSecondaryText' }}
                  >
                    {documentGroups.length} document group{documentGroups.length > 1 ? 's' : ''}
                  </Typography>
                </Box>
                <Typography sx={{ color: 'navbar.primary' }}>View</Typography>
              </Box>
            )}
          </Box>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              {asset.category_name && (
                <Chip
                  size="small"
                  label={asset.category_name}
                  sx={{ backgroundColor: 'navbar.background', color: 'navbar.primary', border: 1, borderColor: 'border' }}
                />
              )}
              {comingSoon && (
                <Chip
                  size="small"
                  label="Coming soon"
                  sx={{
                    backgroundColor: 'marketplace.categoryFilter.background',
                    color: 'marketplace.categoryFilter.text',
                    fontWeight: 500,
                  }}
                />
              )}
              {asset.kyc_required && (
                <Chip
                  size="small"
                  label="KYC required"
                  sx={{ backgroundColor: 'navbar.background', color: 'navbar.primary', border: 1, borderColor: 'border' }}
                />
              )}
            </Box>

            <Typography variant="h4" sx={{ color: 'navbar.primary', fontWeight: 500, mt: 1 }}>
              {asset.name ?? 'Untitled asset'}
            </Typography>

            <Link
              href={`/profile/${asset.business_id}`}
              style={{ textDecoration: 'none' }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5 }}>
                <Avatar
                  src={asset.business_logo_url ?? undefined}
                  alt={asset.business_display_name ?? 'Issuer'}
                  sx={{ width: 28, height: 28 }}
                />
                <Typography variant="subtitle1" sx={{ color: 'navbar.primary' }}>
                  {asset.business_display_name ?? 'Issuer'}
                </Typography>
              </Box>
            </Link>

            {asset.description && (
              <Typography variant="body1" sx={{ color: 'marketplace.filterButtonText', mt: 2 }}>
                {asset.description}
              </Typography>
            )}

            {viewer.isOwner && asset.asset_id && (
              <Button
                onClick={() => router.push(`/asset/${asset.asset_id}/update`)}
                variant="contained"
                sx={{
                  mt: 2,
                  backgroundColor: 'marketplace.viewMoreButtonBackground',
                  border: 1,
                  borderColor: 'marketplace.searchButtonBorder',
                  color: 'navbar.primary',
                  borderRadius: 5,
                  px: 3,
                  py: 1,
                  textTransform: 'none',
                }}
              >
                Update asset data
              </Button>
            )}

            <Box
              sx={{
                mt: 3,
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 1.5,
              }}
            >
              <StatBox
                label="Floor price"
                value={
                  comingSoon || listings.length === 0
                    ? '-'
                    : `${formatUsdc(asset.floor_price_per_fraction)} USDC`
                }
              />
              <StatBox
                label="Total fractions"
                value={asset.total_supply !== null ? String(asset.total_supply) : '-'}
              />
              <StatBox label="Listed for sale" value={String(listedQuantity)} />
              <StatBox
                label="Valuation"
                value={asset.valuation !== null ? `${formatUsdc(asset.valuation)} USDC` : '-'}
              />
            </Box>

            {comingSoon ? (
              <Alert severity="info" sx={{ mt: 3 }}>
                This asset is being prepared and is not purchasable yet. Check back soon.
              </Alert>
            ) : listedQuantity === 0 ? (
              <Alert severity="info" sx={{ mt: 3 }}>
                No fractions are listed for sale right now.
              </Alert>
            ) : (
              <Box
                sx={{
                  mt: 3,
                  p: 2.5,
                  backgroundColor: 'marketplace.filterMenuBackground',
                  border: 1,
                  borderColor: 'assetPurchase.documentRedirectBorder',
                  borderRadius: 2,
                }}
              >
                <Typography variant="h6" sx={{ color: 'navbar.primary', fontWeight: 500 }}>
                  Buy fractions
                </Typography>

                {kycBlocked ? (
                  <Alert
                    severity="warning"
                    sx={{ mt: 2 }}
                    action={
                      <Button
                        color="inherit"
                        size="small"
                        onClick={() => {
                          try {
                            localStorage.setItem('redirectUrl', `/asset/${asset.asset_id}`);
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
                    <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" sx={{ color: 'marketplace.filterButtonText' }}>
                        Fractions to buy
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'navbar.primary', fontWeight: 500 }}>
                        {quantity}
                      </Typography>
                    </Box>
                    <Slider
                      value={quantity}
                      onChange={(_, value) => setQuantity(Array.isArray(value) ? value[0] : value)}
                      min={1}
                      max={Math.max(maxBuyable, 1)}
                      step={1}
                      sx={{ color: 'assetPurchase.slider' }}
                    />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                      <Typography variant="body2" sx={{ color: 'marketplace.filterButtonText' }}>
                        Subtotal
                      </Typography>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="subtitle1" sx={{ color: 'navbar.primary', fontWeight: 500 }}>
                          {formatUsdc(subtotal)} USDC
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'marketplace.filterButtonText' }}>
                          {display.convert(subtotal)} {display.currency}
                        </Typography>
                      </Box>
                    </Box>
                    <Typography variant="caption" sx={{ color: 'marketplace.filterButtonText' }}>
                      Platform fee is added at checkout.
                    </Typography>
                    <Button
                      fullWidth
                      onClick={startPurchase}
                      variant="contained"
                      sx={{
                        mt: 2,
                        backgroundColor: 'marketplace.viewMoreButtonBackground',
                        color: 'marketplace.searchButtonText',
                        border: 1,
                        borderColor: 'marketplace.searchButtonBorder',
                        borderRadius: 5,
                        py: 1.2,
                      }}
                    >
                      {viewer.loggedIn ? 'Continue to checkout' : 'Connect wallet to buy'}
                    </Button>
                  </>
                )}
              </Box>
            )}

            {listings.length > 0 && (
              <Box sx={{ mt: 4 }}>
                <Typography variant="h6" sx={{ color: 'navbar.primary', fontWeight: 500 }}>
                  Active listings
                </Typography>
                <TableContainer sx={{ mt: 1.5, overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <HeaderCell>Seller</HeaderCell>
                        <HeaderCell>Type</HeaderCell>
                        <HeaderCell align="right">Fractions</HeaderCell>
                        <HeaderCell align="right">Price (USDC)</HeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {listings.map((listing) => (
                        <TableRow key={listing.id}>
                          <BodyCell>
                            {sellerNameById.get(listing.lister_id) ?? 'Investor'}
                          </BodyCell>
                          <BodyCell>
                            {listing.kind === 'primary' ? 'Issuer' : 'Resale'}
                          </BodyCell>
                          <BodyCell align="right">{listing.quantity}</BodyCell>
                          <BodyCell align="right">
                            {formatUsdc(listing.price_per_fraction)}
                          </BodyCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}
          </Box>
        </Box>
      </Container>
      <Divider sx={{ backgroundColor: 'divider' }} />
      <Footer />
    </Box>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <Box
      sx={{
        p: 1.5,
        backgroundColor: 'listingCard.background',
        borderRadius: 2,
      }}
    >
      <Typography variant="caption" sx={{ color: 'marketplace.filterButtonText' }}>
        {label}
      </Typography>
      <Typography variant="subtitle1" sx={{ color: 'listingCard.text', fontWeight: 500 }}>
        {value}
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
    <TableCell align={align} sx={{ color: 'portfolio.tableText', fontWeight: 600, borderColor: 'divider' }}>
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
