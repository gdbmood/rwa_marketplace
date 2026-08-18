"use client";

import { Autocomplete, Box, Checkbox, Container, Divider, Switch, TextField, Typography, useColorScheme } from "@mui/material";
import { useActiveAccount, useActiveWalletConnectionStatus, useConnectModal } from "thirdweb/react";
import { connectWalletConfig } from "@/utils/thirdwebConfig";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebaseClient";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";

type RetailPreferences = {
    investmentUpdates: boolean;
    newsInsights: boolean;
    securityAlerts: boolean;
    transactionConfirmations: boolean;
};

type BusinessPreferences = {
    securityAlerts: boolean;
    transactionAlerts: boolean;
};

type Preferences = RetailPreferences | BusinessPreferences;

export default function Settings() {
    const router = useRouter();

    const { connect, isConnecting } = useConnectModal();
    const status = useActiveWalletConnectionStatus();
    const wallet = useActiveAccount()

    const { mode, setMode } = useColorScheme();

    const [tableName, setTableName] = useState<string>('');
    const [loadingState, setLoadingState] = useState(true);
    const [language, setLanguage] = useState("English");
    const [currency, setCurrency] = useState("USD");

    const [preferences, setPreferences] = useState<Preferences | null>(null);
    const [darkMode, setDarkMode] = useState(true);

    useEffect(() => {
        setTableName(window.location.hostname.includes("business") ? "BusinessUser" : "RetailUser");
        setDarkMode(localStorage.getItem("mui-mode") === "dark" ? true : false);
        setPreferences(window.location.hostname.includes("business") ? {
            securityAlerts: true,
            transactionAlerts: true,
        } : {
            investmentUpdates: true,
            newsInsights: true,
            securityAlerts: true,
            transactionConfirmations: true
        });
    }, [])
    useEffect(() => {
        if (!isConnecting && wallet && tableName) {
            db.collection(tableName).doc(wallet.address).get().then((doc) => {
                if (doc.exists) {
                    const data = doc.data();
                    if (data) {
                        setLanguage(data.settings?.language || "English");
                        setCurrency(data.settings?.currency || "USD");
                        if (data.settings?.preferences) { setPreferences(data.settings.preferences as Preferences); }
                    }
                    setLoadingState(false);
                }
            }).catch((error) => {
                console.error("Error getting document:", error);
            });
        }
        else if (status === 'disconnected') {
            connect(connectWalletConfig());
        }
    }, [status, wallet, tableName, isConnecting]);
    useEffect(() => {
        if (wallet && !loadingState) {
            db.collection(tableName).doc(wallet.address).update({
                settings: {
                    language,
                    currency,
                    preferences,
                    darkMode,
                }
            }).catch((error) => {
                console.error("Error updating document:", error);
            });
        }
    }, [language, currency, preferences, darkMode]);

    return (
        <Box sx={{ backgroundColor: "marketplace.background" }}>
            <Navbar />
            <Container>
                <Box sx={{ border: { sm: 1 }, borderColor: "border", borderRadius: 2.5, my: { xs: 1.5, sm: 2.5, verticalTablet: 8, horizontalTablet: 12 } }}>
                    <Box sx={{ px: { xs: 0, sm: 2.5, horizontalTablet: 13 }, py: { xs: 0, sm: 2.5, horizontalTablet: 7.5 } }}>
                        <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h6", verticalTablet: "h5" }, color: 'navbar.primary' }}>Settings</Typography>
                        <Box sx={{ mt: 4, display: "flex", alignItems: "center", gap: 4 }}>
                            <Autocomplete
                                options={["English", "Spanish", "Arabic", "French"]}
                                value={language}
                                onChange={(e, value) => setLanguage(value)}
                                disableClearable
                                sx={{
                                    flexGrow: 1,
                                    '& .MuiFormLabel-root': {
                                        color: 'navbar.primary',
                                    },
                                    '& .MuiAutocomplete-input': {
                                        color: 'navbar.primary',
                                    },
                                    '& .mui-z26e6x-MuiInputBase-root-MuiInput-root::before': {
                                        borderBottom: 1,
                                        borderColor: 'border',
                                    },
                                    "& .MuiSvgIcon-root": {
                                        color: "#BDBDBD"
                                    }
                                }}
                                renderInput={(params) => <TextField variant="standard" {...params} label="Language" />}
                            />
                            <Autocomplete
                                options={["USD", "AED", "EUR"]}
                                value={currency}
                                onChange={(e, value) => setCurrency(value)}
                                disableClearable
                                sx={{
                                    flexGrow: 1,
                                    '& .MuiFormLabel-root': {
                                        color: 'navbar.primary',
                                    },
                                    '& .MuiAutocomplete-input': {
                                        color: 'navbar.primary',
                                    },
                                    '& .mui-z26e6x-MuiInputBase-root-MuiInput-root::before': {
                                        borderBottom: 1,
                                        borderColor: 'border',
                                    },
                                    "& .MuiSvgIcon-root": {
                                        color: "#BDBDBD"
                                    }
                                }}
                                renderInput={(params) => <TextField variant="standard" {...params} label="Currency" />}
                            />
                        </Box>
                        {preferences && <Box sx={{ mt: { xs: 4, sm: 7.5 } }}>
                            <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h6", verticalTablet: "h5" }, color: 'navbar.primary', mb: 3 }}>Notification Preferences</Typography>
                            {(tableName.toLowerCase().includes('business') ?
                                [
                                    {
                                        id: "securityAlerts",
                                        title: "Security Alerts:",
                                        subtitle: "Receive alerts for account activity & verification updates",
                                    },
                                    {
                                        id: "transactionAlerts",
                                        title: "Transaction Alerts:",
                                        subtitle: "Get notified of successful transactions & important updates",
                                    },
                                ]
                                :
                                [
                                    {
                                        id: "investmentUpdates",
                                        title: "Investment Updates:",
                                        subtitle: "Receive alerts on new asset listings & investment opportunities",
                                    },
                                    {
                                        id: "transactionConfirmations",
                                        title: "Transaction Confirmations:",
                                        subtitle: "Get notified of successful purchases & payouts",
                                    },
                                    {
                                        id: "securityAlerts",
                                        title: "Security Alerts:",
                                        subtitle: "Receive alerts for account activity & verification updates",
                                    },
                                    {
                                        id: "newsInsights",
                                        title: "News & Insights:",
                                        subtitle: "Stay updated with industry trends & platform improvements",
                                    },
                                ]).map((item, index) => (
                                    <Box key={index} sx={{ mt: 1, display: "flex", alignItems: "center", justifyContent: 'space-between' }}>
                                        <Box sx={{ display: "flex", flexDirection: { xs: "column", verticalTablet: "row" }, order: { xs: 2, verticalTablet: 1 }, flexGrow: 1 }}>
                                            <Typography sx={{ xs: "subtitle1", verticalTablet: "h6" }}>
                                                <Box component="span" sx={{ color: 'navbar.primary', fontWeight: 500 }}>{item.title}</Box>
                                            </Typography>
                                            <Typography sx={{ xs: "subtitle2", verticalTablet: "h6" }}>
                                                <Box component="span" sx={{ color: 'settings.secondaryText', ml: 0.5 }}>{item.subtitle}</Box>
                                            </Typography>
                                        </Box>
                                        <Checkbox
                                            checked={preferences[item.id as keyof typeof preferences]}
                                            onChange={(e) => setPreferences({ ...preferences, [item.id]: e.target.checked })}
                                            color="primary"
                                            sx={{
                                                color: 'navbar.primary', order: { xs: 1, verticalTablet: 2 },
                                                '&.Mui-checked': {
                                                    color: '#C6FF00',
                                                },
                                            }}
                                            inputProps={{ 'aria-label': 'controlled' }}
                                        />
                                    </Box>
                                ))}
                        </Box>}
                        <Box sx={{ mt: { xs: 4, sm: 7.5 } }}>
                            <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h6", verticalTablet: "h5" }, color: 'navbar.primary', mb: 3 }}>Theme Preferences</Typography>
                            <Box sx={{ mt: 2.5, display: "flex", alignItems: "center", gap: 2 }}>
                                <Typography sx={{ typography: { xs: "subtitle1", verticalTablet: "h6" }, color: 'marketplace.filterButtonText' }}>Dark Mode</Typography>
                                <Switch
                                    onChange={(e) => {
                                        setMode(e.target.checked ? "dark" : "light");
                                        setDarkMode(e.target.checked)
                                    }}
                                    checked={darkMode}
                                    sx={{
                                        color: 'navbar.primary',
                                        '& .MuiSwitch-thumb': {
                                            backgroundColor: '#FAFAFA',
                                        },
                                        '& .MuiSwitch-track': {
                                            backgroundColor: '#424242',
                                        },
                                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                            backgroundColor: '#424242',
                                        },
                                    }} />
                            </Box>
                        </Box>
                    </Box>
                </Box>
            </Container >
            <Divider sx={{ backgroundColor: '#343434', mt: { xs: 2.5, verticalTablet: 8, horizontalTablet: 9 } }} />
            <Footer />
        </Box >
    )
}