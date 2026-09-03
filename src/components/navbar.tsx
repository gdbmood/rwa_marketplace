"use client";

import { Box, Typography, useMediaQuery, Container, Drawer, List, ListItem, ListItemText, Divider, useColorScheme } from '@mui/material';
import { usePathname, useRouter } from 'next/navigation'
import SocialLinks from "@/components/social-links";
import TestWalletLogin from "@/components/auth/test-wallet-login";
import { connectWalletConfig } from '@/utils/thirdwebConfig';
import { counterpartRoleUrl, useRole } from '@/hooks/useRole';
import { isTestMode } from '@/lib/wallet/testAccount';
import sessionStore from '@/store/sessionStore';
import { ConnectButton } from 'thirdweb/react';
import { useState } from 'react';
import "../../public/css/navbar.css"
import Image from 'next/image';
import Link from 'next/link';

/**
 * Shared navigation for both hosts. The connect flow is wired with the role
 * of the current host, so a business user signing in through the navbar is
 * registered as business (this was the retail-registration defect from
 * docs/audit/frontend.md section 3.3). In test mode the thirdweb button is
 * replaced by the local test wallet login.
 */
export default function Navbar() {
    const pathname = usePathname()
    const router = useRouter()

    const { mode } = useColorScheme();
    const { role, ready } = useRole();

    const isSm = useMediaQuery(theme => theme.breakpoints.down('sm'));

    const [drawerOpen, setDrawerOpen] = useState(false);

    const user = sessionStore((state) => state.user);
    const logout = sessionStore((state) => state.logout);

    const isBusiness = role === 'business';
    const connectConfig = connectWalletConfig(role);

    const navLinks = isBusiness
        ? [
            { name: 'Tokenized Assets', url: '/dashboard' },
            { name: 'List New Asset', url: '/list-new-asset' },
        ]
        : [
            { name: 'Marketplace', url: '/marketplace' },
            { name: 'Portfolio', url: '/portfolio' },
        ];

    const handleLogout = async () => {
        setDrawerOpen(false);
        await logout();
        router.push('/');
    };

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
                    <Link href={isBusiness ? '/dashboard' : '/marketplace'}>
                        <Image src='/svg/logo_dark.svg' alt='' width={isSm ? 37 : 55} height={isSm ? 37 : 55} />
                    </Link>
                    <Box sx={{ display: "flex", alignItems: 'center', gap: { xs: 2.5, sm: 4, horizontalTablet: 7.5 }, flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
                        {
                            navLinks.map((item, index) => (
                                <Link key={index} href={item.url}>
                                    <Typography style={{ fontWeight: item.url === pathname ? 700 : 400 }} sx={{ typography: { xs: "subtitle2", sm: "subtitle1" }, cursor: 'pointer', color: item.url === pathname ? 'navbar.primary' : 'navbar.secondary', flexGrow: 1, flexBasis: { xs: "40%", sm: "auto" } }}>{item.name}</Typography>
                                </Link>
                            ))
                        }
                    </Box>
                    <Box sx={{ display: 'flex', gap: 2.5, alignItems: 'center' }}>
                        <Box sx={{ display: { xs: 'none', sm: 'block' }, gap: 2.5, alignItems: 'center' }}>
                            {isTestMode() ? (
                                <TestWalletLogin userType={role} />
                            ) : (
                                ready && <ConnectButton
                                    {...connectConfig}
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
                            )}
                        </Box>
                        <Box sx={{ width: { xs: "30px", sm: "45px" }, cursor: 'pointer' }} onClick={() => setDrawerOpen(true)}>
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

                {/* Drawer for mobile and account actions */}
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
                            {isTestMode() ? (
                                <TestWalletLogin userType={role} />
                            ) : (
                                ready && <ConnectButton
                                    {...connectConfig}
                                    connectButton={{
                                        label:
                                            <Box sx={{ display: 'flex', alignItems: "center", justifyContent: 'space-between' }}>
                                                <Typography style={{ fontWeight: 500 }} variant='subtitle1' sx={{ color: "navbar.primary" }}>Connect Wallet</Typography>
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
                                                    <Typography style={{ fontWeight: 500 }} variant='subtitle1' sx={{ color: "navbar.primary" }}>Wallet Connected</Typography>
                                                </Box>
                                            )
                                        },
                                    }}
                                />
                            )}
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
                                        <Box sx={{ px: 2 }}>
                                            <Divider sx={{ backgroundColor: '#343434' }} />
                                        </Box>
                                    </Box>
                                ))
                            }
                            {ready && (
                                <Box>
                                    <ListItem
                                        component="a"
                                        href={counterpartRoleUrl(role)}
                                        sx={{ cursor: 'pointer' }}
                                    >
                                        <ListItemText primary={isBusiness ? 'Investor Marketplace' : 'Business Portal'} />
                                    </ListItem>
                                    {user && (
                                        <Box sx={{ px: 2 }}>
                                            <Divider sx={{ backgroundColor: '#343434' }} />
                                        </Box>
                                    )}
                                </Box>
                            )}
                            {user && (
                                <ListItem
                                    onClick={handleLogout}
                                    sx={{ cursor: 'pointer' }}
                                    data-testid="navbar-logout"
                                >
                                    <ListItemText primary="Log Out" secondary={`${user.wallet_address.slice(0, 6)}...${user.wallet_address.slice(-4)}`} />
                                </ListItem>
                            )}
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
