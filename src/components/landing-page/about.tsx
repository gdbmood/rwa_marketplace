"use client";

import { Box, Container, Typography, useMediaQuery } from '@mui/material';
import Image from 'next/image';

export default function About() {
    const isSm = useMediaQuery(theme => theme.breakpoints.down('sm'));

    return (
        <Container>
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: { xs: "column", sm: "row" },
                    alignItems: 'center',
                    gap: { xs: 2, sm: 3 },
                    mb: { xs: 5, sm: 10, horizontalTablet: 24 }
                }}
            >
                <Box sx={{ flex: 1 }}>
                    <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h6", sm: "h5", horizontalTablet: "h4" }, color: '#C6FF00', textAlign: { xs: "center", sm: "left" } }}>
                        Tokenize, Tokenize, Tokenize
                    </Typography>
                    <Typography sx={{ typography: { xs: "subtitle1", sm: "h6", horizontalTablet: "h5" }, color: '#FAFAFA', mt: { xs: 1.5, horizontalTablet: 3.5 }, textAlign: { xs: "center", sm: "left" } }}>
                        Our mission is simple: make premium investments accessible to everyone.
                    </Typography>
                    <Typography sx={{ typography: { xs: "subtitle1", verticalTablet: "h6", horizontalTablet: "h5" }, color: '#BDBDBD', mt: { xs: 1.5, horizontalTablet: 2.5 }, textAlign: { xs: "center", sm: "left" }, display: { xs: "none", sm: "block" } }}>
                        With blockchain-powered tokenization, we empower businesses to unlock liquidity and investors to own fractions of real estate, commodities, and fine art—effortlessly.
                    </Typography>
                </Box>
                <Box sx={{ flex: 1 }}>
                    <Image src="/img/Frame 264 (4).png" alt="real estate" width={0} height={0} sizes='100vw' style={{ width: "100%", height: '100%', objectFit: 'cover' }} />
                </Box>
                <Typography sx={{ typography: { xs: "subtitle1", verticalTablet: "h6", horizontalTablet: "h5" }, color: '#BDBDBD', mt: { xs: 1.5, horizontalTablet: 2.5 }, textAlign: { xs: "center", sm: "left" }, display: { xs: "block", sm: "none" } }}>
                    With blockchain-powered tokenization, we empower businesses to unlock liquidity and investors to own fractions of real estate, commodities, and fine art—effortlessly.
                </Typography>
            </Box>
            <Box sx={{ display: { xs: "block", horizontalTablet: "none" } }}>
                <Typography style={{ fontWeight: 500 }} variant={'h6'} sx={{ display: { xs: "block", sm: "none" }, color: '#C6FF00', textAlign: 'center', mb: 4 }}>
                    Fractional Real Estate:
                </Typography>
                <Image src={isSm ? '/svg/Frame 475.svg' : "/img/Fractional Real Estate(1).png"} alt="real estate" width={0} height={0} sizes='100vw' style={{ width: "100%", height: '100%', objectFit: 'cover' }} />
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative', mt: { xs: 4, sm: 0 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', flexDirection: { xs: "column", sm: "row" } }}>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '22px', flex: 1 }}>
                            {['Villa in Dubai Marina', 'Desert Tech', '1,500,000 USD / 65,000,000 AED'].map((item, index) => (
                                <Box key={index} sx={{ border: '1px solid #424242', borderRadius: '66px', py: 2, px: { xs: 3, sm: 4, horizontalTablet: 5 }, backgroundColor: '#171717', flexGrow: 1 }}>
                                    <Typography variant={'subtitle2'} sx={{ color: '#FAFAFA' }}>
                                        {item}
                                    </Typography>
                                </Box>
                            ))}
                        </Box>
                        <Box sx={{ flex: 1, order: { xs: -1, sm: 0 } }}>
                            <Image src="/svg/Frame 377.svg" alt="real estate" width={0} height={0} sizes='100vw' style={{ width: "100%", height: '100%', objectFit: 'cover' }} />
                        </Box>
                    </Box>
                </Box>
            </Box>
            <Box sx={{ display: { xs: "none", horizontalTablet: "block" } }}>
                <Image src={"/img/Fractional Real Estate.png"} alt="real estate" width={0} height={0} sizes='100vw' style={{ width: "100%", height: '100%', objectFit: 'cover' }} />
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
                    <Box sx={{ display: 'flex', justifyContent: { sm: 'space-between' }, position: 'absolute', top: '-20px', gap: 1 }}>
                        {['Villa in Dubai Marina', 'Desert Tech', '1,500,000 USD / 65,000,000 AED'].map((item, index) => (
                            <Box key={index} sx={{ border: '1px solid #424242', borderRadius: '66px', py: 2, px: 5, backgroundColor: '#171717' }}>
                                <Typography sx={{ typography: { xs: "subtitle2", horizontalTablet: "h5" }, color: '#FAFAFA' }}>
                                    {item}
                                </Typography>
                            </Box>
                        ))}
                    </Box>
                </Box>
            </Box>
        </Container>
    )
}
