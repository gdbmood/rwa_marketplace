import { Box } from "@mui/material";
import Image from "next/image";

export default function SocialLinks({ width, height }: { width: number, height: number }) {
    return (
        <Box sx={{ display: "flex", gap: 2 }}>
            <Box sx={{ display: 'flex', gap: 2, mt: 2.5, mb: 4, justifyContent: { md: 'space-between' }, flexWrap: { xs: 'wrap', md: 'nowrap' } }}>
                <Box sx={{ width, height }}>
                    <Box sx={[
                        {
                            display: 'none'
                        },
                        (theme) => theme.applyStyles('dark', {
                            display: "block"
                        })
                    ]}>
                        <Image unoptimized src="/svg/Facebook.svg" alt="facebook" width={0} height={0} sizes='100vw' style={{ width: '100%', height: '100%' }} />
                    </Box>
                    <Box sx={[
                        {
                            display: 'none'
                        },
                        (theme) => theme.applyStyles('light', {
                            display: "block"
                        })
                    ]}>
                        <Image src={"/svg/Facebook_light.svg"} alt='hamburger' height={0} width={0} style={{ width: '100%', height: "100%" }} />
                    </Box>
                </Box>
                <Box sx={{ width, height }}>
                    <Box sx={[
                        {
                            display: 'none'
                        },
                        (theme) => theme.applyStyles('dark', {
                            display: "block"
                        })
                    ]}>
                        <Image unoptimized src="/svg/Linkedin.svg" alt="linkedin" width={0} height={0} sizes='100vw' style={{ width: '100%', height: '100%' }} />
                    </Box>
                    <Box sx={[
                        {
                            display: 'none'
                        },
                        (theme) => theme.applyStyles('light', {
                            display: "block"
                        })
                    ]}>
                        <Image src={"/svg/Linkedin_light.svg"} alt='hamburger' height={0} width={0} style={{ width: '100%', height: "100%" }} />
                    </Box>
                </Box>
                <Box sx={{ width, height }}>
                    <Box sx={[
                        {
                            display: 'none'
                        },
                        (theme) => theme.applyStyles('dark', {
                            display: "block"
                        })
                    ]}>
                        <Image unoptimized src="/svg/Youtube.svg" alt="youtube" width={0} height={0} sizes='100vw' style={{ width: '100%', height: '100%' }} />
                    </Box>
                    <Box sx={[
                        {
                            display: 'none'
                        },
                        (theme) => theme.applyStyles('light', {
                            display: "block"
                        })
                    ]}>
                        <Image src={"/svg/Youtube_light.svg"} alt='hamburger' height={0} width={0} style={{ width: '100%', height: "100%" }} />
                    </Box>
                </Box>
                <Box sx={{ width, height }}>
                    <Box sx={[
                        {
                            display: 'none'
                        },
                        (theme) => theme.applyStyles('dark', {
                            display: "block"
                        })
                    ]}>
                        <Image unoptimized src="/svg/Twitter.svg" alt="twitter" width={0} height={0} sizes='100vw' style={{ width: '100%', height: '100%' }} />
                    </Box>
                    <Box sx={[
                        {
                            display: 'none'
                        },
                        (theme) => theme.applyStyles('light', {
                            display: "block"
                        })
                    ]}>
                        <Image src={"/svg/Twitter_light.svg"} alt='hamburger' height={0} width={0} style={{ width: '100%', height: "100%" }} />
                    </Box>
                </Box>
            </Box>
        </Box>
    )
}