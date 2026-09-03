'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Box, Button, Container, Divider, Typography } from '@mui/material';
import Navbar from '@/components/navbar';
import Footer from '@/components/footer';
import type { DocumentGroup } from '@/components/investor/format';

interface AssetDocsViewProps {
  assetId: string;
  assetName: string;
  groups: DocumentGroup[];
}

function fileNameFromUrl(url: string, fallback: string): string {
  try {
    const path = decodeURIComponent(new URL(url).pathname);
    const segment = path.split('/').pop();
    return segment && segment.trim() !== '' ? segment : fallback;
  } catch {
    return fallback;
  }
}

/** Lists every document group attached to an asset with download links. */
export default function AssetDocsView({ assetId, assetName, groups }: AssetDocsViewProps) {
  const router = useRouter();

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
        <Typography variant="h5" sx={{ color: 'navbar.primary', fontWeight: 500 }}>
          {assetName}: documents
        </Typography>

        {groups.length === 0 ? (
          <Box sx={{ textAlign: 'center', mt: 8 }}>
            <Typography variant="h6" sx={{ color: 'navbar.primary' }}>
              No documents available
            </Typography>
            <Typography variant="body2" sx={{ color: 'marketplace.filterButtonText', mt: 1 }}>
              The issuer has not attached any ownership documents to this asset.
            </Typography>
          </Box>
        ) : (
          groups.map((group) => (
            <Box key={group.name} sx={{ mt: 4 }}>
              <Typography variant="h6" sx={{ color: 'navbar.primary', fontWeight: 500 }}>
                {group.name}
              </Typography>
              {group.urls.map((url, index) => (
                <Box
                  key={url}
                  sx={{
                    mt: 1.5,
                    p: 2,
                    backgroundColor: 'assetPurchase.documentRedirectBackground',
                    border: 1,
                    borderColor: 'assetPurchase.documentRedirectBorder',
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 2,
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      color: 'navbar.primary',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {fileNameFromUrl(url, `${group.name} ${index + 1}`)}
                  </Typography>
                  <Link href={url} target="_blank" rel="noopener noreferrer">
                    <Typography variant="body2" sx={{ color: 'marketplace.categoryFilter.background' }}>
                      Download
                    </Typography>
                  </Link>
                </Box>
              ))}
            </Box>
          ))
        )}

        <Button
          onClick={() => router.push(`/asset/${assetId}`)}
          sx={{
            mt: 5,
            color: 'marketplace.searchButtonText',
            border: 1,
            borderColor: 'marketplace.searchButtonBorder',
            borderRadius: 5,
            py: 1,
            px: 3,
            textTransform: 'none',
          }}
        >
          Back to asset
        </Button>
      </Container>
      <Divider sx={{ backgroundColor: 'divider' }} />
      <Footer />
    </Box>
  );
}
