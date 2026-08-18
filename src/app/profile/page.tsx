"use client";

import { Box, Container, Divider, TextField, Typography, Button, CircularProgress, Modal, useColorScheme } from "@mui/material";
import { useActiveAccount, useActiveWalletConnectionStatus, useConnectModal } from "thirdweb/react";
import { connectWalletConfig } from "@/utils/thirdwebConfig";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebaseClient";
import { logout } from "@/actions/login";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";

export default function ProfilePage() {
    const router = useRouter();

    const wallet = useActiveAccount()
    const status = useActiveWalletConnectionStatus();
    const { connect, isConnecting } = useConnectModal();

    const { mode, setMode } = useColorScheme();

    const [editMode, setEditMode] = useState(false);
    const [domain, setDomain] = useState<string>('');
    const [logoutMode, setLogoutMode] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [userProfile, setUserProfile] = useState<any[]>([]);
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [updatingProfile, setUpdatingProfile] = useState(false);
    const [isRetailVerified, setIsRetailVerified] = useState(false);
    const [isBusinessVerified, setIsBusinessVerified] = useState(false);

    useEffect(() => {
        if (wallet) {
            let tableName = domain.includes("business") ? "BusinessUser" : "RetailUser";
            db.collection(tableName).doc(wallet.address).get().then((doc) => {
                if (doc.exists) {
                    const data = doc.data();
                    if (data) {
                        let payload: any;
                        if (domain.includes("business")) {
                            payload = [
                                {
                                    key: "displayName",
                                    label: "Display Name",
                                    value: data.displayName || ""
                                },
                                {
                                    key: "legalName",
                                    label: "Legal Name",
                                    value: data.legalName || ""
                                },
                                {
                                    key: "email",
                                    label: "Email",
                                    value: data.email || ""
                                },
                                {
                                    key: "phone",
                                    label: "Phone Number",
                                    value: data.phone || ""
                                },
                            ]
                        }
                        else {
                            payload = [
                                {
                                    key: "fullName",
                                    label: "Full Name",
                                    value: data.fullName || ""
                                },
                                {
                                    key: "email",
                                    label: "Email",
                                    value: data.email || ""
                                },
                                {
                                    key: "phone",
                                    label: "Phone Number",
                                    value: data.phone || ""
                                }
                            ]
                        }
                        setUserProfile(payload);
                        setIsRetailVerified(domain.includes("business") ? false : data.isVerified);
                        setIsBusinessVerified(domain.includes("business") ? data.isVerified : false);
                        setLoadingProfile(false);
                    }
                    else {
                        router.push("/");
                    }
                }
            }).catch((error) => {
                console.error("Error getting document:", error);
            });
        }
        else if (status === 'disconnected') {
            connect(connectWalletConfig())
        }
    }, [status, domain, wallet]);
    useEffect(() => { if (error) setUpdatingProfile(false) }, [error]);
    useEffect(() => { setDomain(window.location.hostname) }, []);

    const handleSaveChanges = async () => {
        setError(null);
        if (wallet) {
            if (userProfile.some((input) => input.value === "")) {
                setError("Please fill in all the fields");
                return;
            }
            const phoneNumberField = userProfile.find(input => input.key === 'phone');
            if (phoneNumberField && (phoneNumberField.value.length !== 10 || isNaN(parseInt(phoneNumberField.value)))) {
                setError("Invalid phone number");
                return;
            }

            setUpdatingProfile(true);
            const tableName = domain.includes("business") ? "BusinessUser" : "RetailUser";
            db.collection(tableName).doc(wallet.address).update({
                ...Object.fromEntries(userProfile.map((input) => [input.key, input.value]))
            }).then(() => {
                setUpdatingProfile(false);
                setEditMode(false)
            }).catch((error) => {
                setError("An error occurred while updating your profile. Please try again later.");
                console.error("Error updating document: ", error);
            });
        }
    }

    return (
        <Box sx={{ backgroundColor: "marketplace.background", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
            <Navbar />
            {
                loadingProfile ?
                    <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                        <CircularProgress sx={{ color: '#C6FF00' }} />
                    </Box>
                    :
                    <Container sx={{ my: { xs: 2.5, sm: 3, horizontalTablet: 12 } }}>
                        <Box sx={{ border: { sm: 1 }, borderColor: "border", borderRadius: 2.5, px: { xs: 2.5, verticalTablet: 12 }, py: { xs: 2.5, verticalTablet: 7.5 }, display: 'flex', gap: { xs: 5, horizontalTablet: 11 }, flexDirection: { xs: "column", verticalTablet: "row" } }}>
                            <Box sx={{ flexGrow: 1 }}>
                                <Typography style={{ fontWeight: 500 }} sx={{ typography: { sx: "h6", verticalTablet: "h5" }, color: 'navbar.primary' }}>Account details</Typography>
                                {error && <Typography variant='subtitle2' sx={{ color: 'red' }}>{error}</Typography>}
                                <>
                                    {
                                        userProfile.map((input, index) => (
                                            <Box key={index} sx={{ mt: { xs: 4, horizontalTablet: 5 } }}>
                                                <TextField
                                                    disabled={!editMode}
                                                    fullWidth
                                                    label={input.label}
                                                    variant="standard"
                                                    value={input.value}
                                                    onChange={(e) => {
                                                        const updatedProfile = [...userProfile];
                                                        updatedProfile[index].value = e.target.value;
                                                        setUserProfile(updatedProfile);
                                                    }}
                                                    // Label color
                                                    InputLabelProps={{ style: { color: mode === "dark" ? '#BDBDBD' : "#424242" } }}
                                                    sx={{
                                                        // User input color
                                                        input: { color: "marketplace.filterButtonText" },
                                                        "& .MuiInputBase-input.Mui-disabled": {
                                                            WebkitTextFillColor: mode === "dark" ? '#BDBDBD' : "#424242"
                                                        },

                                                        "& .MuiInput-root": {
                                                            // Bottom border
                                                            "&:before": {
                                                                borderColor: "#424242"
                                                            },
                                                            // Focus bottom border
                                                            "&:after": {
                                                                borderColor: "#424242"
                                                            },
                                                            // Hover bottom border
                                                            ":hover:not(.Mui-focused)": {
                                                                "&:before": {
                                                                    borderColor: "#424242"
                                                                },
                                                            },
                                                        },
                                                    }}
                                                />
                                            </Box>
                                        ))}
                                </>
                            </Box>
                            <Box sx={{ flexGrow: 1 }}>
                                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexDirection: "column", height: "100%" }}>
                                    <Box sx={{ width: "100%" }}>
                                        <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h6", verticalTablet: "h5" }, color: 'navbar.primary' }}>Verification status</Typography>
                                        <Box sx={{ border: "1px solid #424242", borderRadius: 2.5, p: 2.5, mt: 2.5 }}>
                                            {
                                                !domain.includes("business") ?
                                                    <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, alignItems: { sm: "center" }, gap: 1 }}>
                                                        <Typography style={{ fontWeight: 500 }} variant="subtitle1" sx={{ color: "navbar.primary" }}>KYC Approved:</Typography>
                                                        {isRetailVerified ?
                                                            <svg width="24" height="25" viewBox="0 0 24 25" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                                <path fillRule="evenodd" clipRule="evenodd" d="M18 2.32129H6C3.79086 2.32129 2 4.11215 2 6.32129V18.3213C2 20.5304 3.79086 22.3213 6 22.3213H18C20.2091 22.3213 22 20.5304 22 18.3213V6.32129C22 4.11215 20.2091 2.32129 18 2.32129ZM16.592 9.78178C16.8463 9.45482 16.7874 8.98361 16.4605 8.72931C16.1335 8.47501 15.6623 8.53391 15.408 8.86087L11.401 14.0127C11.3119 14.1273 11.1443 14.1422 11.0364 14.0451L8.50173 11.7639C8.19385 11.4868 7.71963 11.5117 7.44254 11.8196C7.16544 12.1275 7.1904 12.6017 7.49828 12.8788L10.033 15.16C10.7881 15.8396 11.9613 15.7356 12.585 14.9336L16.592 9.78178Z" fill="#C6FF00" />
                                                            </svg>
                                                            :
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="25" fill="currentColor" viewBox="0 0 16 16">
                                                                <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0M5.354 4.646a.5.5 0 1 0-.708.708L7.293 8l-2.647 2.646a.5.5 0 0 0 .708.708L8 8.707l2.646 2.647a.5.5 0 0 0 .708-.708L8.707 8l2.647-2.646a.5.5 0 0 0-.708-.708L8 7.293z" style={{ color: '#FF0000' }} />
                                                            </svg>}
                                                    </Box>
                                                    :
                                                    <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, alignItems: { sm: "center" }, gap: 1 }}>
                                                        <Typography variant="subtitle1" style={{ fontWeight: 500 }} sx={{ color: "navbar.primary" }}>KYB Approved:</Typography>
                                                        {isBusinessVerified ?
                                                            <svg width="24" height="25" viewBox="0 0 24 25" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                                <path fillRule="evenodd" clipRule="evenodd" d="M18 2.32129H6C3.79086 2.32129 2 4.11215 2 6.32129V18.3213C2 20.5304 3.79086 22.3213 6 22.3213H18C20.2091 22.3213 22 20.5304 22 18.3213V6.32129C22 4.11215 20.2091 2.32129 18 2.32129ZM16.592 9.78178C16.8463 9.45482 16.7874 8.98361 16.4605 8.72931C16.1335 8.47501 15.6623 8.53391 15.408 8.86087L11.401 14.0127C11.3119 14.1273 11.1443 14.1422 11.0364 14.0451L8.50173 11.7639C8.19385 11.4868 7.71963 11.5117 7.44254 11.8196C7.16544 12.1275 7.1904 12.6017 7.49828 12.8788L10.033 15.16C10.7881 15.8396 11.9613 15.7356 12.585 14.9336L16.592 9.78178Z" fill="#C6FF00" />
                                                            </svg>
                                                            :
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="25" fill="currentColor" viewBox="0 0 16 16">
                                                                <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0M5.354 4.646a.5.5 0 1 0-.708.708L7.293 8l-2.647 2.646a.5.5 0 0 0 .708.708L8 8.707l2.646 2.647a.5.5 0 0 0 .708-.708L8.707 8l2.647-2.646a.5.5 0 0 0-.708-.708L8 7.293z" style={{ color: '#FF0000' }} />
                                                            </svg>}
                                                    </Box>
                                            }
                                        </Box>
                                    </Box>
                                    <Box sx={{ width: "100%" }}>
                                        <Button
                                            disabled={updatingProfile}
                                            onClick={() => {
                                                if (editMode) {
                                                    handleSaveChanges();
                                                }
                                                else {
                                                    setEditMode(!editMode)
                                                }
                                            }} variant="contained" sx={{
                                                ":hover": {
                                                    backgroundColor: '#C6FF00',
                                                    color: '#000000'
                                                },
                                                '&:disabled': {
                                                    backgroundColor: 'marketplace.viewMoreButtonBackground',
                                                    color: '#FFFFFF'
                                                },
                                                backgroundColor: 'marketplace.viewMoreButtonBackground', color: 'navbar.primary', borderRadius: 5, px: 3, py: 1, mt: 4.5, width: "100%", display: "flex", justifyContent: "center", alignItems: "center", gap: 1.5
                                            }}>
                                            {editMode ? "Save Changes" : "Edit account details"}
                                            {updatingProfile && <CircularProgress size={20} sx={{ color: '#C6FF00' }} />}
                                        </Button>
                                        {editMode && !updatingProfile ?
                                            <Button onClick={() => { setEditMode(!editMode) }} variant="contained" sx={{
                                                ":hover": {
                                                    backgroundColor: '#EF5350',
                                                    color: '#FFFFFF'
                                                },
                                                backgroundColor: 'marketplace.categoryFilter.text', color: 'marketplace.filterButtonText', borderRadius: 5, px: 3, py: 1, mt: 2.5, width: "100%"
                                            }}>Cancel changes</Button>
                                            :
                                            <Button onClick={() => { setLogoutMode(!editMode) }} variant="contained" sx={{
                                                ":hover": {
                                                    backgroundColor: '#EF5350',
                                                    color: '#FFFFFF'
                                                },
                                                backgroundColor: 'marketplace.categoryFilter.text', color: 'marketplace.filterButtonText', borderRadius: 5, px: 3, py: 1, mt: 2.5, width: "100%"
                                            }}>Log out</Button>
                                        }
                                    </Box>
                                </Box>
                            </Box>
                        </Box>
                    </Container >
            }
            <Modal
                open={logoutMode}
                aria-labelledby="modal-modal-title"
                aria-describedby="modal-modal-description"
            >
                <Box sx={{ position: { sm: 'absolute' }, top: '50%', left: '50%', transform: { sm: 'translate(-50%, -50%)' }, bgcolor: 'marketplace.background', px: { xs: 3.5, sm: 5, verticalTablet: 12 }, py: 10, width: { xs: "100%", sm: "90%", horizontalTablet: "65%" }, overflowY: 'auto', height: { xs: "100%", sm: 'auto' }, display: "flex", alignItems: "center", flexDirection: "column" }}>
                    <svg width="90" height="89" viewBox="0 0 90 89" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="45" cy="44.5" r="44.5" fill="#212121" />
                        <path opacity="0.4" d="M36.5833 26.25H44.9167C49.519 26.25 53.25 29.981 53.25 34.5833V55.4167C53.25 60.019 49.519 63.75 44.9167 63.75H36.5833C31.981 63.75 28.25 60.019 28.25 55.4167V34.5833C28.25 29.981 31.981 26.25 36.5833 26.25Z" fill="#FF6666" />
                        <path fillRule="evenodd" clipRule="evenodd" d="M58.3951 37.6451C59.0053 37.035 59.9947 37.035 60.6049 37.6451L66.8549 43.8951C67.465 44.5053 67.465 45.4947 66.8549 46.1049L60.6049 52.3549C59.9947 52.965 59.0053 52.965 58.3951 52.3549C57.785 51.7447 57.785 50.7553 58.3951 50.1451L61.9778 46.5625H40.75C39.8871 46.5625 39.1875 45.8629 39.1875 45C39.1875 44.1371 39.8871 43.4375 40.75 43.4375H61.9778L58.3951 39.8549C57.785 39.2447 57.785 38.2553 58.3951 37.6451Z" fill="#FF6666" />
                    </svg>
                    <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h6", sm: "h4" }, color: "navbar.primary", my: { xs: 3, sm: 5 } }}>Are you sure you want to log out?</Typography>
                    <Button
                        onClick={() => { setLogoutMode(false); }}
                        variant="contained"
                        sx={{
                            ":hover": {
                                backgroundColor: '#C6FF00',
                                color: '#000000'
                            },
                            backgroundColor: 'marketplace.viewMoreButtonBackground', color: 'navbar.primary', borderRadius: 5, px: 3, py: 1, width: { xs: "290px", sm: "344px", verticalTablet: "480px" }
                        }}>
                        Stay on the platform
                    </Button>
                    <Button onClick={async () => {
                        await logout();
                        router.push("/login");
                    }} variant="contained" sx={{
                        ":hover": {
                            backgroundColor: '#EF5350',
                            color: '#FFFFFF'
                        },
                        backgroundColor: 'marketplace.categoryFilter.text', color: 'marketplace.filterButtonText', borderRadius: 5, px: 3, py: 1, mt: 2.5, width: { xs: "290px", sm: "344px", verticalTablet: "480px" }
                    }}>Log out</Button>
                </Box>
            </Modal>

            <Divider sx={{ backgroundColor: '#343434', mt: { xs: 3, horizontalTablet: 9 } }} />
            <Footer />
        </Box >
    )
}