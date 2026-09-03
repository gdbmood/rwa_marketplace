"use client";

import { Box, Button, CircularProgress, Container, Modal, TextField, Typography } from "@mui/material";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Image from "next/image";
import { updateProfile } from "@/actions/profile";
import { logout } from "@/actions/login";
import { uploadBusinessFile } from "@/components/business/upload-client";
import { type BusinessProfileDto, shortenAddress } from "@/components/business/types";

const textFieldStyle = {
    input: { color: "marketplace.filterButtonText" },
    "& .MuiInputBase-input.Mui-disabled": {
        WebkitTextFillColor: "#9E9E9E",
    },
    "& .MuiInput-root": {
        "&:before": { borderColor: "#424242" },
        "&:after": { borderColor: "#424242" },
        ":hover:not(.Mui-focused)": {
            "&:before": { borderColor: "#424242" },
        },
    },
};

interface ProfileField {
    key: "displayName" | "legalName" | "email" | "phone";
    label: string;
    value: string;
}

/** Business account details: public identity, logo, KYB badge, logout. */
export default function BusinessProfileView(props: { profile: BusinessProfileDto }) {
    const router = useRouter();

    const [fields, setFields] = useState<ProfileField[]>([
        { key: "displayName", label: "Display Name", value: props.profile.displayName },
        { key: "legalName", label: "Legal Name", value: props.profile.legalName },
        { key: "email", label: "Email", value: props.profile.email },
        { key: "phone", label: "Phone Number", value: props.profile.phone },
    ]);
    const [logoUrl, setLogoUrl] = useState<string | null>(props.profile.logoUrl);
    const [pendingLogo, setPendingLogo] = useState<File | null>(null);

    const [editMode, setEditMode] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [logoutMode, setLogoutMode] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);

    const saveChanges = async () => {
        setError(null);
        setNotice(null);

        if (fields.some((field) => field.value.trim() === "")) {
            setError("Please fill in all the fields");
            return;
        }
        const phone = fields.find((field) => field.key === "phone")?.value ?? "";
        if (phone.length !== 10 || Number.isNaN(parseInt(phone, 10))) {
            setError("Invalid phone number");
            return;
        }

        setSaving(true);
        try {
            let uploadedLogoUrl: string | undefined;
            if (pendingLogo) {
                const uploaded = await uploadBusinessFile(pendingLogo, "logo");
                uploadedLogoUrl = uploaded.url;
            }

            const result = await updateProfile({
                displayName: fields.find((f) => f.key === "displayName")?.value,
                legalName: fields.find((f) => f.key === "legalName")?.value,
                email: fields.find((f) => f.key === "email")?.value,
                phone,
                ...(uploadedLogoUrl ? { logoUrl: uploadedLogoUrl } : {}),
            });
            if (!result.ok) {
                setError(result.error.message);
                return;
            }
            if (uploadedLogoUrl) {
                setLogoUrl(uploadedLogoUrl);
                setPendingLogo(null);
            }
            setEditMode(false);
            setNotice("Profile updated");
            router.refresh();
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "An error occurred while updating your profile. Please try again later.");
        } finally {
            setSaving(false);
        }
    };

    const logoPreview = pendingLogo ? URL.createObjectURL(pendingLogo) : logoUrl;

    return (
        <Container sx={{ my: { xs: 2.5, sm: 3, horizontalTablet: 12 }, flexGrow: 1 }}>
            <Box sx={{ border: { sm: 1 }, borderColor: "border", borderRadius: 2.5, px: { xs: 2.5, verticalTablet: 12 }, py: { xs: 2.5, verticalTablet: 7.5 }, display: "flex", gap: { xs: 5, horizontalTablet: 11 }, flexDirection: { xs: "column", verticalTablet: "row" } }}>
                <Box sx={{ flexGrow: 1 }}>
                    <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h6", verticalTablet: "h5" }, color: "navbar.primary" }}>Account details</Typography>
                    {error && <Typography data-testid="business-profile-error" variant="subtitle2" sx={{ color: "red" }}>{error}</Typography>}
                    {notice && <Typography data-testid="business-profile-notice" variant="subtitle2" sx={{ color: "#C6FF00" }}>{notice}</Typography>}

                    <Box sx={{ mt: 3, display: "flex", alignItems: "center", gap: 2 }}>
                        <Box sx={{ position: "relative", width: 72, height: 72, borderRadius: "50%", overflow: "hidden", backgroundColor: "#212121", flexShrink: 0 }}>
                            {logoPreview ? (
                                <Image src={logoPreview} alt="Company logo" fill sizes="72px" style={{ objectFit: "cover" }} />
                            ) : (
                                <Box sx={{ height: "100%", display: "flex", justifyContent: "center", alignItems: "center" }}>
                                    <Typography variant="caption" sx={{ color: "#757575" }}>No logo</Typography>
                                </Box>
                            )}
                        </Box>
                        <Box>
                            <Typography variant="subtitle2" sx={{ color: "marketplace.filterButtonText" }}>Company logo</Typography>
                            {editMode && (
                                <Button component="label" size="small" sx={{ mt: 0.5, color: "#C6FF00", textTransform: "none", px: 0 }}>
                                    Upload new logo
                                    <input
                                        hidden
                                        type="file"
                                        accept="image/png,image/jpeg"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) { return; }
                                            if (file.size > 5 * 1024 * 1024) {
                                                setError("File size should be less than 5MB");
                                                return;
                                            }
                                            setError(null);
                                            setPendingLogo(file);
                                        }}
                                    />
                                </Button>
                            )}
                        </Box>
                    </Box>

                    {fields.map((field, index) => (
                        <Box key={field.key} sx={{ mt: { xs: 4, horizontalTablet: 5 } }}>
                            <TextField
                                disabled={!editMode}
                                fullWidth
                                label={field.label}
                                variant="standard"
                                value={field.value}
                                onChange={(e) => {
                                    const updated = [...fields];
                                    updated[index] = { ...field, value: e.target.value };
                                    setFields(updated);
                                }}
                                InputLabelProps={{ style: { color: "#9E9E9E" } }}
                                sx={textFieldStyle}
                            />
                        </Box>
                    ))}

                    <Typography variant="subtitle2" sx={{ color: "portfolio.secondaryText", mt: 4 }}>
                        Wallet: {shortenAddress(props.profile.walletAddress)}
                    </Typography>
                </Box>

                <Box sx={{ flexGrow: 1 }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexDirection: "column", height: "100%" }}>
                        <Box sx={{ width: "100%" }}>
                            <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h6", verticalTablet: "h5" }, color: "navbar.primary" }}>Verification status</Typography>
                            <Box sx={{ border: "1px solid #424242", borderRadius: 2.5, p: 2.5, mt: 2.5 }}>
                                <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, alignItems: { sm: "center" }, gap: 1 }}>
                                    <Typography variant="subtitle1" style={{ fontWeight: 500 }} sx={{ color: "navbar.primary" }}>KYB Approved:</Typography>
                                    {props.profile.isVerified ? (
                                        <svg data-testid="kyb-approved" width="24" height="25" viewBox="0 0 24 25" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path fillRule="evenodd" clipRule="evenodd" d="M18 2.32129H6C3.79086 2.32129 2 4.11215 2 6.32129V18.3213C2 20.5304 3.79086 22.3213 6 22.3213H18C20.2091 22.3213 22 20.5304 22 18.3213V6.32129C22 4.11215 20.2091 2.32129 18 2.32129ZM16.592 9.78178C16.8463 9.45482 16.7874 8.98361 16.4605 8.72931C16.1335 8.47501 15.6623 8.53391 15.408 8.86087L11.401 14.0127C11.3119 14.1273 11.1443 14.1422 11.0364 14.0451L8.50173 11.7639C8.19385 11.4868 7.71963 11.5117 7.44254 11.8196C7.16544 12.1275 7.1904 12.6017 7.49828 12.8788L10.033 15.16C10.7881 15.8396 11.9613 15.7356 12.585 14.9336L16.592 9.78178Z" fill="#C6FF00" />
                                        </svg>
                                    ) : (
                                        <svg data-testid="kyb-not-approved" xmlns="http://www.w3.org/2000/svg" width="24" height="25" fill="currentColor" viewBox="0 0 16 16">
                                            <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0M5.354 4.646a.5.5 0 1 0-.708.708L7.293 8l-2.647 2.646a.5.5 0 0 0 .708.708L8 8.707l2.646 2.647a.5.5 0 0 0 .708-.708L8.707 8l2.647-2.646a.5.5 0 0 0-.708-.708L8 7.293z" style={{ color: "#FF0000" }} />
                                        </svg>
                                    )}
                                </Box>
                                {!props.profile.isVerified && (
                                    <Button onClick={() => router.push("/verify-business")} sx={{ mt: 1.5, color: "#C6FF00", textTransform: "none", px: 0 }}>
                                        Complete verification
                                    </Button>
                                )}
                            </Box>
                        </Box>
                        <Box sx={{ width: "100%" }}>
                            <Button
                                disabled={saving}
                                onClick={() => {
                                    if (editMode) {
                                        saveChanges();
                                    } else {
                                        setNotice(null);
                                        setEditMode(true);
                                    }
                                }}
                                variant="contained"
                                sx={{
                                    ":hover": { backgroundColor: "#C6FF00", color: "#000000" },
                                    "&:disabled": { backgroundColor: "marketplace.viewMoreButtonBackground", color: "#FFFFFF" },
                                    backgroundColor: "marketplace.viewMoreButtonBackground", color: "navbar.primary", borderRadius: 5, px: 3, py: 1, mt: 4.5, width: "100%", display: "flex", justifyContent: "center", alignItems: "center", gap: 1.5,
                                }}
                            >
                                {editMode ? "Save Changes" : "Edit account details"}
                                {saving && <CircularProgress size={20} sx={{ color: "#C6FF00" }} />}
                            </Button>
                            {editMode && !saving ? (
                                <Button onClick={() => {
                                    setEditMode(false);
                                    setError(null);
                                    setPendingLogo(null);
                                    setFields([
                                        { key: "displayName", label: "Display Name", value: props.profile.displayName },
                                        { key: "legalName", label: "Legal Name", value: props.profile.legalName },
                                        { key: "email", label: "Email", value: props.profile.email },
                                        { key: "phone", label: "Phone Number", value: props.profile.phone },
                                    ]);
                                }} variant="contained" sx={{
                                    ":hover": { backgroundColor: "#EF5350", color: "#FFFFFF" },
                                    backgroundColor: "marketplace.categoryFilter.text", color: "marketplace.filterButtonText", borderRadius: 5, px: 3, py: 1, mt: 2.5, width: "100%",
                                }}>Cancel changes</Button>
                            ) : (
                                <Button onClick={() => setLogoutMode(true)} variant="contained" sx={{
                                    ":hover": { backgroundColor: "#EF5350", color: "#FFFFFF" },
                                    backgroundColor: "marketplace.categoryFilter.text", color: "marketplace.filterButtonText", borderRadius: 5, px: 3, py: 1, mt: 2.5, width: "100%",
                                }}>Log out</Button>
                            )}
                        </Box>
                    </Box>
                </Box>
            </Box>

            <Modal open={logoutMode} aria-labelledby="logout-confirm">
                <Box sx={{ position: { sm: "absolute" }, top: "50%", left: "50%", transform: { sm: "translate(-50%, -50%)" }, bgcolor: "marketplace.background", px: { xs: 3.5, sm: 5, verticalTablet: 12 }, py: 10, width: { xs: "100%", sm: "90%", horizontalTablet: "65%" }, overflowY: "auto", height: { xs: "100%", sm: "auto" }, display: "flex", alignItems: "center", flexDirection: "column" }}>
                    <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h6", sm: "h4" }, color: "navbar.primary", my: { xs: 3, sm: 5 }, textAlign: "center" }}>
                        Are you sure you want to log out?
                    </Typography>
                    <Button
                        onClick={() => setLogoutMode(false)}
                        variant="contained"
                        sx={{
                            ":hover": { backgroundColor: "#C6FF00", color: "#000000" },
                            backgroundColor: "marketplace.viewMoreButtonBackground", color: "navbar.primary", borderRadius: 5, px: 3, py: 1, width: { xs: "290px", sm: "344px", verticalTablet: "480px" },
                        }}
                    >
                        Stay on the platform
                    </Button>
                    <Button
                        disabled={loggingOut}
                        onClick={async () => {
                            setLoggingOut(true);
                            await logout();
                            router.push("/");
                            router.refresh();
                        }}
                        variant="contained"
                        sx={{
                            ":hover": { backgroundColor: "#EF5350", color: "#FFFFFF" },
                            backgroundColor: "marketplace.categoryFilter.text", color: "marketplace.filterButtonText", borderRadius: 5, px: 3, py: 1, mt: 2.5, width: { xs: "290px", sm: "344px", verticalTablet: "480px" },
                        }}
                    >
                        Log out
                        {loggingOut && <CircularProgress size={18} sx={{ color: "marketplace.filterButtonText", ml: 1 }} />}
                    </Button>
                </Box>
            </Modal>
        </Container>
    );
}
