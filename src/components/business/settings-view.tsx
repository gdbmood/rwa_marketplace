"use client";

import { Autocomplete, Box, Checkbox, CircularProgress, Container, Switch, TextField, Typography, useColorScheme } from "@mui/material";
import { useState } from "react";
import { updateSettings } from "@/actions/profile";
import type { BusinessSettingsDto } from "@/components/business/types";

const LANGUAGES = ["English", "Spanish", "Arabic", "French"];
const CURRENCIES = ["USD", "AED", "EUR"];

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

/**
 * Business settings: language, currency, notification preferences, dark mode.
 * Each change saves through the updateSettings action with visible save and
 * error feedback (no silent failures).
 */
export default function BusinessSettingsView(props: { settings: BusinessSettingsDto }) {
    const { mode, setMode } = useColorScheme();

    const [language, setLanguage] = useState(props.settings.language);
    const [currency, setCurrency] = useState(props.settings.currency);
    const [preferences, setPreferences] = useState(props.settings.preferences);
    const [darkMode, setDarkMode] = useState(mode ? mode === "dark" : props.settings.darkMode);

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [saved, setSaved] = useState(false);

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
            setSaved(true);
        } catch {
            setError("Could not save your settings, please try again");
        } finally {
            setSaving(false);
        }
    }

    return (
        <Container sx={{ flexGrow: 1 }}>
            <Box sx={{ border: { sm: 1 }, borderColor: "border", borderRadius: 2.5, my: { xs: 1.5, sm: 2.5, verticalTablet: 8, horizontalTablet: 12 } }}>
                <Box sx={{ px: { xs: 0, sm: 2.5, horizontalTablet: 13 }, py: { xs: 0, sm: 2.5, horizontalTablet: 7.5 } }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                        <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h6", verticalTablet: "h5" }, color: "navbar.primary" }}>Settings</Typography>
                        {saving && <CircularProgress size={16} sx={{ color: "#C6FF00" }} />}
                        {!saving && saved && <Typography variant="caption" sx={{ color: "#C6FF00" }}>Saved</Typography>}
                    </Box>
                    {error && <Typography variant="subtitle2" sx={{ color: "red", mt: 1 }}>{error}</Typography>}

                    <Box sx={{ mt: 4, display: "flex", alignItems: "center", gap: 4 }}>
                        <Autocomplete
                            options={LANGUAGES}
                            value={language}
                            onChange={(_, value) => {
                                if (value) {
                                    setLanguage(value);
                                    persist({ language: value });
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
                                    persist({ currency: value });
                                }
                            }}
                            disableClearable
                            sx={autocompleteStyle}
                            renderInput={(params) => <TextField variant="standard" {...params} label="Currency" />}
                        />
                    </Box>

                    <Box sx={{ mt: { xs: 4, sm: 7.5 } }}>
                        <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h6", verticalTablet: "h5" }, color: "navbar.primary", mb: 3 }}>Notification Preferences</Typography>
                        {BUSINESS_PREFERENCE_ITEMS.map((item) => (
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
                                    checked={preferences[item.id] ?? false}
                                    onChange={(e) => {
                                        const next = { ...preferences, [item.id]: e.target.checked };
                                        setPreferences(next);
                                        persist({ preferences: next });
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
                                    persist({ darkMode: e.target.checked });
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
        </Container>
    );
}
