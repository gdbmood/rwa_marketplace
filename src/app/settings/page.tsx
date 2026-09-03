"use client";

import { Autocomplete, Box, Button, Checkbox, CircularProgress, Container, Divider, Switch, TextField, Typography, useColorScheme } from "@mui/material";
import { useEffect, useState } from "react";
import { updateSettings } from "@/actions/profile";
import sessionStore, { type SessionUser } from "@/store/sessionStore";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";

/**
 * Shared settings screen (retail host; the business host rewrites /settings
 * to /business/settings). All persistence goes through the updateSettings
 * server action; the browser never writes to the database. The preference
 * set follows the account type from the session, not the hostname.
 */

const LANGUAGES = ["English", "Spanish", "Arabic", "French"];
const CURRENCIES = ["USD", "AED", "EUR"];

const RETAIL_PREFERENCE_ITEMS = [
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
];

const BUSINESS_PREFERENCE_ITEMS = [
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
];

const autocompleteStyle = {
    flexGrow: 1,
    "& .MuiFormLabel-root": { color: "navbar.primary" },
    "& .MuiAutocomplete-input": { color: "navbar.primary" },
    "& .MuiSvgIcon-root": { color: "#BDBDBD" },
};

interface ParsedSettings {
    language: string;
    currency: string;
    darkMode: boolean;
    preferences: Record<string, boolean>;
}

function parseSettings(user: SessionUser): ParsedSettings {
    const raw =
        user.settings && typeof user.settings === "object" && !Array.isArray(user.settings)
            ? (user.settings as Record<string, unknown>)
            : {};
    const preferences: Record<string, boolean> = {};
    const rawPreferences = raw.preferences;
    if (rawPreferences && typeof rawPreferences === "object" && !Array.isArray(rawPreferences)) {
        for (const [key, value] of Object.entries(rawPreferences)) {
            if (typeof value === "boolean") {
                preferences[key] = value;
            }
        }
    }
    return {
        language: typeof raw.language === "string" && raw.language ? raw.language : "English",
        currency: typeof raw.currency === "string" && raw.currency ? raw.currency : "USD",
        darkMode: typeof raw.darkMode === "boolean" ? raw.darkMode : true,
        preferences,
    };
}

function SettingsForm({ user }: { user: SessionUser }) {
    const { mode, setMode } = useColorScheme();
    const initial = parseSettings(user);

    const [language, setLanguage] = useState(initial.language);
    const [currency, setCurrency] = useState(initial.currency);
    const [preferences, setPreferences] = useState(initial.preferences);
    const [darkMode, setDarkMode] = useState(mode ? mode === "dark" : initial.darkMode);

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [saved, setSaved] = useState(false);

    const preferenceItems =
        user.type === "business" ? BUSINESS_PREFERENCE_ITEMS : RETAIL_PREFERENCE_ITEMS;

    async function persist(patch: {
        language?: string;
        currency?: string;
        darkMode?: boolean;
        preferences?: Record<string, boolean>;
    }) {
        setSaving(true);
        setError("");
        setSaved(false);
        try {
            const result = await updateSettings(patch);
            if (!result.ok) {
                setError(result.error.message);
                return;
            }
            // Keep the cached session user fresh so other screens (e.g.
            // currency display) pick up the change without a reload.
            sessionStore.getState().setUser(result.data);
            setSaved(true);
        } catch {
            setError("Could not save your settings, please try again");
        } finally {
            setSaving(false);
        }
    }

    return (
        <Box sx={{ border: { sm: 1 }, borderColor: "border", borderRadius: 2.5, my: { xs: 1.5, sm: 2.5, verticalTablet: 8, horizontalTablet: 12 } }}>
            <Box sx={{ px: { xs: 0, sm: 2.5, horizontalTablet: 13 }, py: { xs: 0, sm: 2.5, horizontalTablet: 7.5 } }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h6", verticalTablet: "h5" }, color: "navbar.primary" }}>Settings</Typography>
                    {saving && <CircularProgress size={16} sx={{ color: "#C6FF00" }} />}
                    {!saving && saved && <Typography variant="caption" sx={{ color: "#C6FF00" }}>Saved</Typography>}
                </Box>
                {error && <Typography variant="subtitle2" sx={{ color: "red", mt: 1 }} data-testid="settings-error">{error}</Typography>}

                <Box sx={{ mt: 4, display: "flex", alignItems: "center", gap: 4 }}>
                    <Autocomplete
                        options={LANGUAGES}
                        value={language}
                        onChange={(_, value) => {
                            if (value) {
                                setLanguage(value);
                                void persist({ language: value });
                            }
                        }}
                        disableClearable
                        sx={autocompleteStyle}
                        renderInput={(params) => <TextField variant="standard" {...params} label="Language" />}
                    />
                    <Autocomplete
                        options={CURRENCIES}
                        value={currency}
                        onChange={(_, value) => {
                            if (value) {
                                setCurrency(value);
                                void persist({ currency: value });
                            }
                        }}
                        disableClearable
                        sx={autocompleteStyle}
                        renderInput={(params) => <TextField variant="standard" {...params} label="Currency" />}
                    />
                </Box>

                <Box sx={{ mt: { xs: 4, sm: 7.5 } }}>
                    <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h6", verticalTablet: "h5" }, color: "navbar.primary", mb: 3 }}>Notification Preferences</Typography>
                    {preferenceItems.map((item) => (
                        <Box key={item.id} sx={{ mt: 1, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <Box sx={{ display: "flex", flexDirection: { xs: "column", verticalTablet: "row" }, order: { xs: 2, verticalTablet: 1 }, flexGrow: 1 }}>
                                <Typography>
                                    <Box component="span" sx={{ color: "navbar.primary", fontWeight: 500 }}>{item.title}</Box>
                                </Typography>
                                <Typography>
                                    <Box component="span" sx={{ color: "settings.secondaryText", ml: 0.5 }}>{item.subtitle}</Box>
                                </Typography>
                            </Box>
                            <Checkbox
                                data-testid={`pref-${item.id}`}
                                checked={preferences[item.id] ?? true}
                                onChange={(e) => {
                                    const next = { ...preferences, [item.id]: e.target.checked };
                                    setPreferences(next);
                                    void persist({ preferences: next });
                                }}
                                color="primary"
                                sx={{
                                    color: "navbar.primary", order: { xs: 1, verticalTablet: 2 },
                                    "&.Mui-checked": { color: "#C6FF00" },
                                }}
                                inputProps={{ "aria-label": "controlled" }}
                            />
                        </Box>
                    ))}
                </Box>

                <Box sx={{ mt: { xs: 4, sm: 7.5 } }}>
                    <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h6", verticalTablet: "h5" }, color: "navbar.primary", mb: 3 }}>Theme Preferences</Typography>
                    <Box sx={{ mt: 2.5, display: "flex", alignItems: "center", gap: 2 }}>
                        <Typography sx={{ typography: { xs: "subtitle1", verticalTablet: "h6" }, color: "marketplace.filterButtonText" }}>Dark Mode</Typography>
                        <Switch
                            onChange={(e) => {
                                setMode(e.target.checked ? "dark" : "light");
                                setDarkMode(e.target.checked);
                                void persist({ darkMode: e.target.checked });
                            }}
                            checked={darkMode}
                            sx={{
                                color: "navbar.primary",
                                "& .MuiSwitch-thumb": { backgroundColor: "#FAFAFA" },
                                "& .MuiSwitch-track": { backgroundColor: "#424242" },
                                "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": { backgroundColor: "#424242" },
                            }} />
                    </Box>
                </Box>
            </Box>
        </Box>
    );
}

export default function Settings() {
    const user = sessionStore((state) => state.user);
    const status = sessionStore((state) => state.status);
    const sessionError = sessionStore((state) => state.error);
    const refresh = sessionStore((state) => state.refresh);

    // AppProviders refreshes once on mount; this covers direct navigation
    // after a login elsewhere left the store unauthenticated.
    useEffect(() => {
        if (status === "unauthenticated") {
            void refresh();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    let content: React.ReactNode;
    if (status === "idle" || status === "loading") {
        content = (
            <Box sx={{ display: "flex", justifyContent: "center", py: 20 }}>
                <CircularProgress sx={{ color: "#C6FF00" }} />
            </Box>
        );
    } else if (status === "error") {
        content = (
            <Box sx={{ textAlign: "center", py: 20 }}>
                <Typography sx={{ color: "red" }} data-testid="settings-error">
                    {sessionError ?? "Could not load your session"}
                </Typography>
                <Button onClick={() => void refresh()} sx={{ mt: 2, color: "#C6FF00", textTransform: "none" }}>
                    Try again
                </Button>
            </Box>
        );
    } else if (!user) {
        content = (
            <Box sx={{ textAlign: "center", py: 20 }}>
                <Typography variant="h6" sx={{ color: "navbar.primary" }}>
                    Connect your wallet to manage your settings
                </Typography>
            </Box>
        );
    } else {
        content = <SettingsForm key={user.id} user={user} />;
    }

    return (
        <Box sx={{ backgroundColor: "marketplace.background", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
            <Navbar />
            <Container sx={{ flexGrow: 1 }}>
                {content}
            </Container>
            <Divider sx={{ backgroundColor: "#343434", mt: { xs: 2.5, verticalTablet: 8, horizontalTablet: 9 } }} />
            <Footer />
        </Box>
    );
}
