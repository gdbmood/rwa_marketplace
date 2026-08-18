export const dynamic = 'force-dynamic';

import HeroSection from '@/components/landing-page/hero-section';
import Highlights from '@/components/landing-page/highlights';
import Content from '@/components/landing-page/content';
import Preview from '@/components/landing-page/preview';
import Footer from '@/components/landing-page/footer';
import Navbar from '@/components/landing-page/navbar';
import About from '@/components/landing-page/about';
import { Box } from '@mui/material';

export default function Home() {
  return (
    <Box sx={{ backgroundColor: '#141414' }}>
      <Navbar />
      <HeroSection />
      <Preview />
      <Highlights />
      <About />
      <Content />
      <Footer />
    </Box>
  );
}
