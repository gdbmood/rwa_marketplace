'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Avatar, Box, Chip, Typography } from '@mui/material';
import type { MarketplaceAssetRow } from '@/lib/db/assets';
import { formatUsdc, metadataImageUrls } from '@/components/investor/format';

interface AssetCardProps {
  asset: MarketplaceAssetRow;
}

/**
 * One marketplace card. Draft and minting assets render as Coming soon (no
 * price, still linked to the detail page); active assets show the floor
 * price; KYC-gated assets carry a badge.
 */
export default function AssetCard({ asset }: AssetCardProps) {
  const router = useRouter();

  const comingSoon = asset.status === 'draft' || asset.status === 'minting';
  const soldOut =
    asset.status === 'sold_out' || (!comingSoon && !asset.is_purchasable);
  const imageUrl = metadataImageUrls(asset.metadata)[0] ?? null;
  const floorPrice = asset.floor_price_per_fraction ?? asset.mint_price_per_fraction;

  return (
    <Box
      onClick={() => router.push(`/asset/${asset.asset_id}`)}
      sx={{
        backgroundColor: 'listingCard.background',
        borderRadius: '12px',
        overflow: 'hidden',
        cursor: 'pointer',
        width: { xs: '47%', sm: '45%', md: '30%', lg: '23%' },
        flexGrow: 1,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box sx={{ position: 'relative', height: { xs: 150, sm: 210 } }}>
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={asset.name ?? 'Asset image'}
            fill
            sizes="(max-width: 600px) 50vw, 25vw"
            style={{ objectFit: 'cover' }}
          />
        ) : (
          <Box
            sx={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'marketplace.filterMenuBackground',
            }}
          >
            <Typography variant="body2" sx={{ color: 'marketplace.filterButtonText' }}>
              No image yet
            </Typography>
          </Box>
        )}
        <Box sx={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 0.5 }}>
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
              sx={{
                backgroundColor: 'navbar.background',
                color: 'navbar.primary',
                border: 1,
                borderColor: 'border',
              }}
            />
          )}
        </Box>
      </Box>

      <Box sx={{ p: { xs: 1.5, sm: 2 }, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Avatar
            src={asset.business_logo_url ?? undefined}
            alt={asset.business_display_name ?? 'Issuer'}
            sx={{ width: 22, height: 22 }}
          />
          <Typography
            variant="body2"
            sx={{
              color: 'listingCard.text',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {asset.business_display_name ?? 'Issuer'}
          </Typography>
        </Box>
        <Typography
          style={{ fontWeight: 500 }}
          sx={{
            typography: { xs: 'subtitle2', sm: 'subtitle1' },
            color: 'listingCard.text',
            mt: 0.5,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {asset.name ?? 'Untitled asset'}
        </Typography>
        <Typography variant="caption" sx={{ color: 'marketplace.filterButtonText' }}>
          {asset.category_name ?? ''}
        </Typography>

        <Box sx={{ mt: 'auto', pt: 1 }}>
          {comingSoon ? (
            <Typography variant="body2" sx={{ color: 'marketplace.filterButtonText' }}>
              Not yet purchasable
            </Typography>
          ) : soldOut ? (
            <Typography variant="body2" sx={{ color: 'readSlider.secondary', fontWeight: 500 }}>
              Sold out
            </Typography>
          ) : (
            <Typography variant="body2" sx={{ color: 'listingCard.text' }}>
              From{' '}
              <Box component="span" sx={{ fontWeight: 600 }}>
                {formatUsdc(floorPrice)} USDC
              </Box>{' '}
              per fraction
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}
