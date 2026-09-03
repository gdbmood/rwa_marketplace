'use client';

import { useRouter } from 'next/navigation';
import { Box, Button, Container, Typography } from '@mui/material';
import Navbar from '@/components/navbar';
import Footer from '@/components/footer';

interface AssetNotFoundProps {
  message: string;
  code: string;
}

/** Error state for the asset detail route (unknown id, load failure). */
export default function AssetNotFound({ message, code }: AssetNotFoundProps) {
  const router = useRouter();
  const notFound = code === 'not_found' || code === 'invalid_input';

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
      <Container sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Box sx={{ textAlign: 'center', py: 10 }}>
          <Typography variant="h5" sx={{ color: 'navbar.primary', fontWeight: 500 }}>
            {notFound ? 'Asset not found' : 'Something went wrong'}
          </Typography>
          <Typography variant="body1" sx={{ color: 'marketplace.filterButtonText', mt: 1.5 }}>
            {notFound
              ? 'This asset does not exist or is no longer available.'
              : message}
          </Typography>
          <Button
            onClick={() => router.push('/marketplace')}
            variant="contained"
            sx={{
              mt: 4,
              backgroundColor: 'marketplace.viewMoreButtonBackground',
              color: 'marketplace.searchButtonText',
              border: 1,
              borderColor: 'marketplace.searchButtonBorder',
              borderRadius: 5,
              py: 1,
              px: 3,
            }}
          >
            Back to marketplace
          </Button>
        </Box>
      </Container>
      <Footer />
    </Box>
  );
}
