"use client";

import { Box, Typography, Stack, Container, useMediaQuery } from '@mui/material';
import Image from 'next/image';

export default function Highlights() {
    const isBelow961 = useMediaQuery(theme => theme.breakpoints.down(961));

    return (
        <Container>
            <Box sx={{ mt: { xs: 5, sm: 10, horizontalTablet: 24 }, pb: { xs: 5, sm: 10, horizontalTablet: 24 }, width: '100%' }}>
                <Box sx={{ color: '#C6FF00', textAlign: 'center', fontWeight: 500 }}>
                    <Typography sx={{ typography: { xs: "h6", sm: "h5", horizontalTablet: "h4" } }}>
                        Numbers Speak Louder Than Words
                    </Typography>
                    <Typography sx={{ typography: { xs: "h6", sm: "h5", horizontalTablet: "h4" } }}>
                        We don’t just talk about impact—we measure it.
                    </Typography>
                    <Typography sx={{ typography: { xs: "subtitle1", sm: "h6", horizontalTablet: "h5" }, color: '#ECEFF1', mt: { xs: 1.5, horizontalTablet: 5 } }}>
                        Explore the numbers behind our marketplace and discover how blockchain is redefining investments.
                    </Typography>
                </Box>

                <Box sx={{
                    backgroundImage: 'url(/img/Body21.png)',
                    backgroundSize: 'contain',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    <Container>
                        <Box
                            sx={{
                                mt: { xs: 3, horizontalTablet: 5 },
                                height: { xs: "100%", sm: 314, horizontalTablet: 400 },
                                display: 'flex',
                                flexDirection: { xs: "column", sm: "row" },
                                alignItems: 'center',
                                gap: 2,
                            }}
                        >
                            <Box sx={{
                                width: { xs: "100%", sm: "50%", horizontalTablet: "60%" },
                                height: '100%',
                                backgroundColor: 'rgba(0, 0, 0, 0.45)',
                                border: '1px solid rgba(189, 189, 189, 0.3)',
                                borderRadius: 4,
                                py: { xs: 3, horizontalTablet: 4 },
                                pl: { xs: 1.5, horizontalTablet: 4 },
                                pr: 0,
                                display: 'flex',
                                flexDirection: 'column',
                            }}>
                                <Typography style={{ fontWeight: 700 }} sx={{ typography: { xs: "subtitle1", horizontalTablet: "h4" }, color: '#C6FF00' }}>$2 million+</Typography>
                                <Typography style={{ fontWeight: 500 }} sx={{ color: '#E0E0E0', fontSize: { sm: "16px", horizontalTablet: "30px" } }}>In tokenized assets</Typography>
                                <Typography sx={{ typography: { xs: "subtitle2", horizontalTablet: "h5" }, color: '#9E9E9E', mt: 2.5, width: "80%" }}>Unlocking new investment opportunities with real-world assets backed by blockchain.</Typography>
                                <Stack direction="row" spacing={1} sx={{ mt: 3, overflow: 'hidden', flexGrow: 1 }}>
                                    {[
                                        {
                                            title: 'Commodities',
                                            image: '/webp/Card2.webp'
                                        },
                                        {
                                            title: 'Real Estate',
                                            image: '/webp/Card4.webp'
                                        },
                                        {
                                            title: 'Commodities',
                                            image: '/webp/Card1.webp'
                                        },
                                        {
                                            title: 'Luxury Watches',
                                            image: '/webp/Card3.webp'
                                        },
                                        {
                                            title: 'Commodities',
                                            image: '/webp/Card5.webp'
                                        },
                                        {
                                            title: 'Real Estate',
                                            image: '/webp/Card6.webp'
                                        },
                                    ].map((item, index) => {
                                        return (
                                            <Box key={index} sx={{ backgroundColor: 'rgba(57, 57, 57, 0.3)', borderRadius: 4, width: '106px', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                                                <Typography style={{ fontWeight: 500 }} variant="subtitle2" sx={{ color: 'white', mb: 2, overflow: 'clip', textOverflow: 'ellipsis', whiteSpace: 'nowrap', p: 1 }}>{item.title}</Typography>
                                                <Image src={item.image} alt={item.title} width={0} height={0} sizes='100vw' style={{ width: '100%', height: "100%", objectFit: 'cover' }} />
                                            </Box>
                                        )
                                    })}
                                </Stack>
                            </Box>
                            <Box sx={{
                                width: '100%',
                                height: '100%',
                                backgroundColor: 'rgba(0, 0, 0, 0.45)',
                                border: '1px solid rgba(189, 189, 189, 0.3)',
                                borderRadius: 4,
                                p: { xs: 1.5, horizontalTablet: 3 },
                                pt: { xs: 3, horizontalTablet: 4 },
                            }}>
                                <Typography style={{ fontWeight: 700 }} sx={{ typography: { xs: "subtitle1", horizontalTablet: "h4" }, color: '#C6FF00' }}>Multicurrency Payments</Typography>
                                <Typography style={{ fontWeight: 500 }} sx={{ color: '#E0E0E0', fontSize: { sm: "16px", horizontalTablet: "30px" } }}>Transacting fiat and crypto</Typography>
                                <Box sx={{ mt: { xs: 3, horizontalTablet: 4 } }}>
                                    <Image src="/webp/Frame 337.webp" alt="real estate" width={0} height={0} sizes='100vw' style={{ width: "100%", height: '100%', objectFit: 'cover' }} />
                                </Box>
                            </Box>
                        </Box>

                        <Box
                            sx={{
                                display: 'flex',
                                flexDirection: { xs: "column", sm: "row" },
                                alignItems: 'center',
                                height: { xs: "100%", sm: 314, horizontalTablet: 400 },
                                gap: 2,
                                mt: 2.5,
                            }}
                        >
                            <Box sx={{
                                width: { xs: "100%", horizontalTablet: "40%" },
                                height: '100%',
                                backgroundColor: 'rgba(0, 0, 0, 0.45)',
                                border: '1px solid rgba(189, 189, 189, 0.3)',
                                borderRadius: 4,
                                pt: { xs: 3, horizontalTablet: 4 },
                            }}>
                                <Box sx={{ pl: { xs: 1.5, sm: 3 } }}>
                                    <Typography style={{ fontWeight: 700 }} sx={{ typography: { xs: "subtitle1", horizontalTablet: "h4" }, color: '#C6FF00' }}>2400+</Typography>
                                    <Typography style={{ fontWeight: 500 }} sx={{ color: '#E0E0E0', fontSize: { sm: "16px", horizontalTablet: "30px" } }}>Businesses transforming assets into digital wealth</Typography>
                                </Box>
                                <Box sx={{ mt: 4 }}>
                                    <Image src="/img/Frame 386.png" alt="real estate" width={0} height={0} sizes='100vw' style={{ width: "100%", height: '100%', objectFit: 'cover' }} />
                                </Box>
                            </Box>
                            <Box sx={{
                                width: { xs: "100%", horizontalTablet: "60%" },
                                height: '100%',
                                backgroundColor: 'rgba(0, 0, 0, 0.45)',
                                border: '1px solid rgba(189, 189, 189, 0.3)',
                                borderRadius: 4,
                                px: { xs: 1.5, horizontalTablet: 4 },
                                py: 4,
                            }}>
                                <Typography style={{ fontWeight: 700 }} sx={{ typography: { xs: "subtitle1", horizontalTablet: "h4" }, color: '#C6FF00' }}>24%</Typography>
                                <Typography style={{ fontWeight: 500 }} sx={{ color: '#E0E0E0', fontSize: { sm: "16px", horizontalTablet: "30px" } }}>Average ROI for investors</Typography>
                                <Typography sx={{ typography: { xs: "subtitle2", horizontalTablet: "h5" }, color: '#9E9E9E', mt: 2.5 }}>Maximizing returns through secure, transparent, and liquid asset-backed investments.</Typography>
                                <Box sx={{ mt: 1 }}>
                                    <Image src="/svg/Frame 393.svg" alt="real estate" width={0} height={0} sizes='100vw' style={{ width: "100%", height: isBelow961 ? "120px" : "180px" }} />
                                </Box>
                            </Box>
                        </Box>
                    </Container>
                </Box >
            </Box >
        </Container>
    )
}
