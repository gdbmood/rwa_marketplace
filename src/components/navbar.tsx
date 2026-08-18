"use client";

import { Box, Typography, useMediaQuery, Container, Drawer, List, ListItem, ListItemText, Divider, useColorScheme } from '@mui/material';
import { generatePayload, isLoggedIn, login, logout } from "@/actions/login";
import { usePathname, useRouter } from 'next/navigation'
import SocialLinks from "@/components/social-links";
import { inAppWallet } from 'thirdweb/wallets';
import { ConnectButton } from 'thirdweb/react';
import { client } from '@/lib/thirdWebClient';
import { useEffect, useState } from 'react';
import { defineChain } from 'thirdweb';
import "../../public/css/navbar.css"
import Image from 'next/image';
import Link from 'next/link';

export default function Navbar() {
    const pathname = usePathname()
    const router = useRouter()

    const { mode, setMode } = useColorScheme();

    const isSm = useMediaQuery(theme => theme.breakpoints.down('sm'));

    const [domain, setDomain] = useState<string | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);

    useEffect(() => { setDomain(window.location.hostname) }, []);

    return (
        <Box sx={{
            position: 'sticky',
            top: 0,
            width: '100%',
            zIndex: 1000,
            backgroundColor: "navbar.background",
            borderBottom: 1,
            borderBottomColor: 'divider',
        }}>
            <Container>
                <Box sx={{
                    py: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}>
                    <Link href={domain?.includes('business') ? '/dashboard' : '/marketplace'}>
                        <Image src='/svg/logo_dark.svg' alt='' width={isSm ? 37 : 55} height={isSm ? 37 : 55} />
                    </Link>
                    <Box sx={{ display: "flex", alignItems: 'center', gap: { xs: 2.5, sm: 4, horizontalTablet: 7.5 }, flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
                        {
                            (domain?.includes('business') ?
                                [{
                                    name: 'Tokenized Assets',
                                    url: '/dashboard'
                                },
                                {
                                    name: 'List New Asset',
                                    url: '/list-new-asset'
                                }]
                                :
                                [{
                                    name: 'Marketplace',
                                    url: '/marketplace'
                                },
                                {
                                    name: 'Portfolio',
                                    url: '/portfolio'
                                }])
                                .map((item, index) => (
                                    <Link key={index} href={item.url}>
                                        <Typography style={{ fontWeight: item.url === pathname ? 700 : 400 }} sx={{ typography: { xs: "subtitle2", sm: "subtitle1" }, cursor: 'pointer', color: item.url === pathname ? 'navbar.primary' : 'navbar.secondary', flexGrow: 1, flexBasis: { xs: "40%", sm: "auto" } }}>{item.name}</Typography>
                                    </Link>
                                ))
                        }
                    </Box>
                    <Box sx={{ display: 'flex', gap: 2.5, alignItems: 'center' }}>
                        <Box sx={{ display: { xs: 'none', sm: 'block' }, gap: 2.5, alignItems: 'center' }}>
                            <ConnectButton client={client}
                                accountAbstraction={{ chain: defineChain(parseInt(process.env.NEXT_PUBLIC_THIRDWEB_CHAIN_ID!)), sponsorGas: true }}
                                wallets={[inAppWallet({
                                    auth: {
                                        options: ["email", "passkey", "google", "apple", "facebook"]
                                    },
                                    hidePrivateKeyExport: true
                                })]}
                                chain={defineChain(parseInt(process.env.NEXT_PUBLIC_THIRDWEB_CHAIN_ID!))}
                                auth={{
                                    isLoggedIn: async (address) => { return await isLoggedIn(); },
                                    doLogin: async (params) => { await login(params) },
                                    getLoginPayload: async ({ address }) => { return await generatePayload(address) },
                                    doLogout: async () => { await logout() },
                                }}
                                connectButton={{
                                    label:
                                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                            <Typography style={{ fontWeight: 500 }} variant='subtitle1' sx={{ color: "thirdwebButton.text" }}>Connect Wallet</Typography>
                                            <Image src="/svg/wallet_dark.svg" alt='wallet' height={24} width={24} />
                                        </Box>,
                                    style: {
                                        backgroundColor: mode === "dark" ? '#C6FF00' : '#36AB00',
                                        borderRadius: "71px",
                                    }
                                }}
                                signInButton={{
                                    label: 'Login',
                                    style: {
                                        backgroundColor: mode === "dark" ? '#C6FF00' : '#36AB00',
                                        borderRadius: "71px"
                                    }
                                }}
                            />
                        </Box>
                        <Box sx={{ width: { xs: "30px", sm: "45px" } }} onClick={() => setDrawerOpen(true)}>
                            <Box sx={[
                                {
                                    display: 'none'
                                },
                                (theme) => theme.applyStyles('dark', {
                                    display: "block"
                                })
                            ]}>
                                <Image src={"/svg/Hamburger_dark.svg"} alt='hamburger' height={0} width={0} style={{ width: '100%', height: "100%" }} />
                            </Box>
                            <Box sx={[
                                {
                                    display: 'none'
                                },
                                (theme) => theme.applyStyles('light', {
                                    display: "block"
                                })
                            ]}>
                                <Image src={"/svg/Hamburger_light.svg"} alt='hamburger' height={0} width={0} style={{ width: '100%', height: "100%" }} />
                            </Box>
                        </Box>
                    </Box>
                </Box>

                {/* Drawer for mobile */}
                <Drawer PaperProps={{
                    sx: {
                        backgroundColor: 'navbar.drawer.background',
                        color: 'navbar.drawer.text',
                        width: 250,
                        '& a': {
                            color: 'navbar.drawer.text',
                            textDecoration: 'none',
                        },
                        '& a:hover': {
                            color: '#C6FF00',
                        },
                        display: 'flex',
                        justifyContent: 'space-between'
                    }
                }} anchor="right" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
                    <Box sx={{ width: '100%' }}>
                        <Box sx={{ display: { xs: 'block', sm: 'none' }, px: 2, width: 250, marginTop: 4 }}>
                            <ConnectButton client={client}
                                accountAbstraction={{ chain: defineChain(parseInt(process.env.NEXT_PUBLIC_THIRDWEB_CHAIN_ID!)), sponsorGas: true }}
                                wallets={[inAppWallet({
                                    auth: {
                                        options: ["email", "passkey", "google", "apple", "facebook"]
                                    },
                                    hidePrivateKeyExport: true
                                })]}
                                chain={defineChain(parseInt(process.env.NEXT_PUBLIC_THIRDWEB_CHAIN_ID!))}
                                auth={{
                                    isLoggedIn: async (address) => { return await isLoggedIn(); },
                                    doLogin: async (params) => { await login(params) },
                                    getLoginPayload: async ({ address }) => { return await generatePayload(address) },
                                    doLogout: async () => { await logout() },
                                }}
                                connectButton={{
                                    label:
                                        <Box sx={{ display: 'flex', alignItems: "center", justifyContent: 'space-between' }}>
                                            <Typography style={{ fontWeight: 500 }} variant='subtitle1' sx={{ color: "navbar.primary" }}>Connect Wallet</Typography>
                                            <Box sx={[
                                                {
                                                    display: 'none'
                                                },
                                                (theme) => theme.applyStyles('dark', {
                                                    display: "block"
                                                })
                                            ]}>
                                                <svg width="25" height="25" viewBox="0 0 25 25" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                    <path fillRule="evenodd" clipRule="evenodd" d="M18.5 2.5H12.5C10.8213 2.5 9.38413 3.53408 8.79074 5H22.2092C21.6158 3.53408 20.1787 2.5 18.5 2.5ZM2.5 16.5V12.5H6.5C7.60457 12.5 8.5 13.3954 8.5 14.5C8.5 15.6046 7.60457 16.5 6.5 16.5H2.5ZM6.5 6.5H22.5V14.5C22.5 15.0523 22.0523 15.5 21.5 15.5H18.5C16.2909 15.5 14.5 17.2909 14.5 19.5V21.5C14.5 22.0523 14.0523 22.5 13.5 22.5H6.5C4.29086 22.5 2.5 20.7091 2.5 18.5V18H6.5C8.433 18 10 16.433 10 14.5C10 12.567 8.433 11 6.5 11H2.5V10.5C2.5 8.29086 4.29086 6.5 6.5 6.5ZM20.25 18.5C20.25 18.0858 19.9142 17.75 19.5 17.75C19.0858 17.75 18.75 18.0858 18.75 18.5V19.75H17.5C17.0858 19.75 16.75 20.0858 16.75 20.5C16.75 20.9142 17.0858 21.25 17.5 21.25H18.75V22.5C18.75 22.9142 19.0858 23.25 19.5 23.25C19.9142 23.25 20.25 22.9142 20.25 22.5V21.25H21.5C21.9142 21.25 22.25 20.9142 22.25 20.5C22.25 20.0858 21.9142 19.75 21.5 19.75H20.25V18.5Z" fill="#FAFAFA" />
                                                </svg>
                                            </Box>
                                            <Box sx={[
                                                {
                                                    display: 'none'
                                                },
                                                (theme) => theme.applyStyles('light', {
                                                    display: "block"
                                                })
                                            ]}>
                                                <svg width="37" height="37" viewBox="0 0 37 37" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                    <rect x="0.5" y="0.5" width="36" height="36" rx="6.5" fill="#FAFAFA" />
                                                    <rect x="0.5" y="0.5" width="36" height="36" rx="6.5" stroke="#E0E0E0" />
                                                    <path fillRule="evenodd" clipRule="evenodd" d="M24.5 8.5H18.5C16.8213 8.5 15.3841 9.53408 14.7907 11H28.2092C27.6158 9.53408 26.1787 8.5 24.5 8.5ZM8.5 22.5V18.5H12.5C13.6046 18.5 14.5 19.3954 14.5 20.5C14.5 21.6046 13.6046 22.5 12.5 22.5H8.5ZM12.5 12.5H28.5V20.5C28.5 21.0523 28.0523 21.5 27.5 21.5H24.5C22.2909 21.5 20.5 23.2909 20.5 25.5V27.5C20.5 28.0523 20.0523 28.5 19.5 28.5H12.5C10.2909 28.5 8.5 26.7091 8.5 24.5V24H12.5C14.433 24 16 22.433 16 20.5C16 18.567 14.433 17 12.5 17H8.5V16.5C8.5 14.2909 10.2909 12.5 12.5 12.5ZM26.25 24.5C26.25 24.0858 25.9142 23.75 25.5 23.75C25.0858 23.75 24.75 24.0858 24.75 24.5V25.75H23.5C23.0858 25.75 22.75 26.0858 22.75 26.5C22.75 26.9142 23.0858 27.25 23.5 27.25H24.75V28.5C24.75 28.9142 25.0858 29.25 25.5 29.25C25.9142 29.25 26.25 28.9142 26.25 28.5V27.25H27.5C27.9142 27.25 28.25 26.9142 28.25 26.5C28.25 26.0858 27.9142 25.75 27.5 25.75H26.25V24.5Z" fill="#36AB00" />
                                                </svg>
                                            </Box>
                                        </Box>,
                                    style: {
                                        display: "block",
                                        minWidth: '0',
                                        background: "transparent",
                                        padding: "0",
                                        width: "100%"
                                    }
                                }}
                                signInButton={{
                                    label: 'Connect Wallet',
                                    style: {
                                        display: "block",
                                        minWidth: '0',
                                        background: "transparent",
                                        padding: "0",
                                        width: "100%",
                                        color: 'white',
                                    },
                                    className: 'sm-connect-button'
                                }}
                                detailsButton={{
                                    render: () => {
                                        return (
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: "center", height: "40px" }}>
                                                <Typography style={{ fontWeight: 500 }} variant='subtitle1' sx={{ color: "navbar.primary" }}>Wallet Conected</Typography>
                                                <Box sx={[
                                                    {
                                                        display: 'none'
                                                    },
                                                    (theme) => theme.applyStyles('dark', {
                                                        display: "block"
                                                    })
                                                ]}>
                                                    <svg width="25" height="25" viewBox="0 0 25 25" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                        <path fillRule="evenodd" clipRule="evenodd" d="M18.5 2.5H12.5C10.8213 2.5 9.38413 3.53408 8.79074 5H22.2092C21.6158 3.53408 20.1787 2.5 18.5 2.5ZM2.5 16.5V12.5H6.5C7.60457 12.5 8.5 13.3954 8.5 14.5C8.5 15.6046 7.60457 16.5 6.5 16.5H2.5ZM6.5 6.5H22.5V14.5C22.5 15.0523 22.0523 15.5 21.5 15.5H18.5C16.2909 15.5 14.5 17.2909 14.5 19.5V21.5C14.5 22.0523 14.0523 22.5 13.5 22.5H6.5C4.29086 22.5 2.5 20.7091 2.5 18.5V18H6.5C8.433 18 10 16.433 10 14.5C10 12.567 8.433 11 6.5 11H2.5V10.5C2.5 8.29086 4.29086 6.5 6.5 6.5ZM23.0644 18.9939C23.3372 18.6822 23.3056 18.2083 22.9939 17.9356C22.6822 17.6628 22.2083 17.6944 21.9356 18.0061L19.0657 21.286C18.9776 21.3867 18.8258 21.4002 18.7213 21.3166L16.9685 19.9143C16.6451 19.6556 16.1731 19.708 15.9143 20.0315C15.6556 20.3549 15.708 20.8269 16.0315 21.0857L17.7843 22.4879C18.5156 23.0729 19.5778 22.9786 20.1945 22.2738L23.0644 18.9939Z" fill="#C6FF00" />
                                                    </svg>
                                                </Box>
                                                <Box sx={[
                                                    {
                                                        display: 'none'
                                                    },
                                                    (theme) => theme.applyStyles('light', {
                                                        display: "block"
                                                    })
                                                ]}>
                                                    <svg width="37" height="37" viewBox="0 0 37 37" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                        <rect x="0.5" y="0.5" width="36" height="36" rx="6.5" fill="#FAFAFA" />
                                                        <rect x="0.5" y="0.5" width="36" height="36" rx="6.5" stroke="#E0E0E0" />
                                                        <path fillRule="evenodd" clipRule="evenodd" d="M24.5 8.5H18.5C16.8213 8.5 15.3841 9.53408 14.7907 11H28.2092C27.6158 9.53408 26.1787 8.5 24.5 8.5ZM8.5 22.5V18.5H12.5C13.6046 18.5 14.5 19.3954 14.5 20.5C14.5 21.6046 13.6046 22.5 12.5 22.5H8.5ZM12.5 12.5H28.5V20.5C28.5 21.0523 28.0523 21.5 27.5 21.5H24.5C22.2909 21.5 20.5 23.2909 20.5 25.5V27.5C20.5 28.0523 20.0523 28.5 19.5 28.5H12.5C10.2909 28.5 8.5 26.7091 8.5 24.5V24H12.5C14.433 24 16 22.433 16 20.5C16 18.567 14.433 17 12.5 17H8.5V16.5C8.5 14.2909 10.2909 12.5 12.5 12.5ZM29.0644 24.9939C29.3372 24.6822 29.3056 24.2083 28.9939 23.9356C28.6822 23.6628 28.2083 23.6944 27.9356 24.0061L25.0657 27.286C24.9776 27.3867 24.8258 27.4002 24.7213 27.3166L22.9685 25.9143C22.6451 25.6556 22.1731 25.708 21.9143 26.0315C21.6556 26.3549 21.708 26.8269 22.0315 27.0857L23.7843 28.4879C24.5156 29.0729 25.5778 28.9786 26.1945 28.2738L29.0644 24.9939Z" fill="#36AB00" />
                                                    </svg>
                                                </Box>
                                            </Box>
                                        )
                                    },
                                }}
                            />
                        </Box>
                        <List sx={{ width: 250, marginTop: { sm: 4 } }}>
                            {
                                [{
                                    name: 'Profile',
                                    url: '/profile'
                                },
                                {
                                    name: 'Settings',
                                    url: '/settings'
                                }].map((item, index) => (
                                    <Box key={index}>
                                        <Link href={item.url}>
                                            <ListItem>
                                                <ListItemText primary={item.name} />
                                            </ListItem >
                                        </Link>
                                        {index !== 1 &&
                                            <Box sx={{ px: 2 }}>
                                                <Divider sx={{ backgroundColor: '#343434' }} />
                                            </Box>
                                        }
                                    </Box>
                                ))
                            }
                        </List>
                    </Box>
                    <Box sx={{ padding: 2 }}>
                        <Box>
                            Explore key resources, company insights, and stay connected with us on social media:
                        </Box>
                        <SocialLinks width={40} height={40} />
                        <Box sx={{ marginTop: 2 }}>
                            <Typography variant="body2">
                                2025 All Rights Reserved
                            </Typography>
                        </Box>
                    </Box>
                </Drawer >
            </Container>
        </Box >
    )
}