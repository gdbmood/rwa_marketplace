import { Box, Typography, Divider, Container } from '@mui/material';
import GetStartedButton from '@/components/get-started-button'
import Logo from '../../../public/svg/logo_white.svg';
import Image from 'next/image';

export default function Footer() {
    return (
        <Box sx={{ backgroundColor: "#1B1B1B", width: '100%', color: 'white' }}>
            <Container sx={{ display: 'flex', flexDirection: { xs: "column", sm: 'row' }, justifyContent: 'space-between', py: 5, gap: 2 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, justifyContent: 'space-between' }} >
                    <Image src={Logo} alt="logo" width={87} height={87} />
                    <Box>
                        <Typography style={{ fontWeight: 500 }} variant={'h6'} sx={{ color: '#FAFAFA', fontSize: { xs: "16px", horizontalTablet: "22px" } }}>
                            Address
                        </Typography>
                        <Typography sx={{ typography: { xs: "subtitle1", horizontalTablet: "h6" }, color: "#BDBDBD" }}>
                            Al Nahyan - E25 - Abu Dhabi
                        </Typography>
                        <Typography style={{ fontWeight: 500 }} variant={'h6'} sx={{ color: '#FAFAFA', fontSize: { xs: "16px", horizontalTablet: "22px" }, mt: 2 }}>
                            Contact Us
                        </Typography>
                        <Typography sx={{ typography: { xs: "subtitle1", horizontalTablet: "h6" }, color: "#BDBDBD" }}>
                            mailexample@gmail.com
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, whiteSpace: 'nowrap', color: '#FAFAFA', fontWeight: 500, fontSize: '22px' }}>
                        <Typography sx={{ typography: { xs: "subtitle2", horizontalTablet: "h6" }, fontSize: { xs: "18px", sm: "14px", horizontalTablet: "20px" } }}>Privacy Policy</Typography>
                        <Divider orientation="vertical" flexItem sx={{ backgroundColor: '#BDBDBD' }} />
                        <Typography sx={{ typography: { xs: "subtitle2", horizontalTablet: "h6" }, fontSize: { xs: "18px", sm: "14px", horizontalTablet: "20px" } }}>Terms of Service</Typography>
                    </Box>
                </Box>
                <Box sx={{ display: { xs: "block", horizontalTablet: "none" }, width: { xs: "100%", sm: "30%" } }}>
                    <GetStartedButton />
                </Box>
                <Box sx={{ maxWidth: { xs: "100%", sm: "30%" }, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box>
                        <Typography sx={{ typography: { xs: "subtitle2", horizontalTablet: "h6" }, color: '#FAFAFA', fontSize: { xs: "18px", sm: "14px", horizontalTablet: "20px" } }}>Explore key resources, company insights, and stay connected with us on social media:</Typography>
                        <Box sx={{ display: 'flex', gap: 2, mt: 2.5, mb: 4, justifyContent: { md: 'space-between' }, flexWrap: { xs: 'wrap', md: 'nowrap' } }}>
                            <Box sx={{ width: { xs: "44px", sm: "60px" }, height: { xs: "44px", sm: "60px" } }}>
                                <Image unoptimized src="/svg/Facebook.svg" alt="facebook" width={0} height={0} sizes='100vw' style={{ width: '100%', height: '100%' }} />
                            </Box>
                            <Box sx={{ width: { xs: "44px", sm: "60px" }, height: { xs: "44px", sm: "60px" } }}>
                                <Image unoptimized src="/svg/Linkedin.svg" alt="linkedin" width={0} height={0} sizes='100vw' style={{ width: '100%', height: '100%' }} />
                            </Box>
                            <Box sx={{ width: { xs: "44px", sm: "60px" }, height: { xs: "44px", sm: "60px" } }}>
                                <Image unoptimized src="/svg/Youtube.svg" alt="youtube" width={0} height={0} sizes='100vw' style={{ width: '100%', height: '100%' }} />
                            </Box>
                            <Box sx={{ width: { xs: "44px", sm: "60px" }, height: { xs: "44px", sm: "60px" } }}>
                                <Image unoptimized src="/svg/Twitter.svg" alt="twitter" width={0} height={0} sizes='100vw' style={{ width: '100%', height: '100%' }} />
                            </Box>
                        </Box>
                    </Box>
                    <Box sx={{ mt: 4, display: { xs: "none", horizontalTablet: "block" } }}>
                        <GetStartedButton />
                    </Box>
                    <Typography sx={{ typography: { xs: "h6", sm: "subtitle2", horizontalTablet: "h6" }, mt: { sm: 2, md: 5 }, color: "#BDBDBD" }}>
                        2025 All Rights Reserved
                    </Typography>
                </Box>
            </Container >
        </Box >
    )
}
