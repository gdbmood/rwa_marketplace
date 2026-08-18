import { Box, Typography, Pagination, Container, Avatar } from '@mui/material';
import Image from 'next/image';

export default function Content() {
    return (
        <>
            <Container sx={{ paddingTop: { xs: 6, sm: 12, horizontalTablet: 19 } }}>
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                        mb: { xs: 3, md: 6 },
                    }}
                >
                    <Box sx={{ width: '100%', textAlign: { xs: "center", sm: "left" } }}>
                        <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h6", sm: "h5", horizontalTablet: "h4" }, color: '#C6FF00' }}>
                            Stay informed with educational content on tokenization, RWAs, and Web3 adoption.</Typography>
                        <Typography sx={{ typography: { xs: "subtitle1", sm: "h6", horizontalTablet: "h5" }, color: { xs: "#BDBDBD", horizontalTablet: "#FAFAFA" }, mt: { xs: 1.5, horizontalTablet: 4 } }}>
                            Our blog covers industry trends, regulatory updates, and insights on how blockchain is transforming asset ownership.</Typography>
                    </Box>
                    <Box sx={{ width: '100%', display: { xs: "none", horizontalTablet: "block" } }}>
                        <Image src="/img/Frame 264 (5).png" alt="real estate" width={0} height={0} sizes='100vw' style={{ width: "100%", height: '100%', objectFit: 'cover' }} />
                    </Box>
                </Box>
            </Container>

            <Box sx={{
                backgroundImage: 'url(/img/Body41.png)',
                backgroundSize: 'contain',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                mt: { xs: 6, sm: 10, horizontalTablet: 0 },
            }}>
                <Container>
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
                        {[1, 2, 3.4].map((item, index) => (
                            <Box key={index}>
                                <Image src="/img/content.png" alt="real estate" width={0} height={0} sizes='100vw' style={{ width: "100%", height: '100%', objectFit: 'cover', borderRadius: "10px" }} />
                                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 2 }}>
                                    <Avatar sx={{ width: '40px', height: '40px', backgroundColor: '#BDBDBD' }}>OP</Avatar>
                                    <Typography variant='subtitle2' sx={{ color: '#BDBDBD' }}>Author Name - 13 Jan 2025</Typography>
                                </Box>
                                <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "subtitle1", horizontalTablet: "h6" }, color: '#FAFAFA' }}>How Tokenized RWAs are Changing Finance</Typography>
                            </Box>
                        ))}
                    </Box>

                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mt: 3, pb: 5 }}>
                        <Pagination count={10} sx={{
                            '& .MuiPaginationItem-root': {
                                color: 'white',
                                '&.Mui-selected': {
                                    color: '#C6FF00',
                                }
                            }
                        }} />
                    </Box>
                </Container>
            </Box >
        </>
    )
}
