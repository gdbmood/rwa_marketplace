"use client";

import { Box, Button, CircularProgress, Typography } from "@mui/material";
import SumsubWebSdk from "@sumsub/websdk-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getMyProfile } from "@/actions/profile";

const VERIFIED_POLL_INTERVAL_MS = 4000;

/**
 * Sumsub WebSDK screen for business verification (KYB). The access token is
 * minted by the secured session route (JWT fully verified server side). Once
 * the applicant is approved, the webhook flips users.is_verified; this panel
 * polls the profile and forwards to the dashboard when that lands.
 */
export default function SumsubPanel(props: { level: string }) {
    const router = useRouter();

    const [token, setToken] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [awaitingResult, setAwaitingResult] = useState(false);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchToken = async (): Promise<string> => {
        const response = await fetch(`/api/create-verification-session?level=${props.level}`);
        if (!response.ok) {
            throw new Error(
                response.status === 401
                    ? "Your session expired, please reconnect your wallet"
                    : "Could not start the verification session",
            );
        }
        return (await response.json()) as string;
    };

    const loadToken = async () => {
        setError("");
        try {
            setToken(await fetchToken());
        } catch (tokenError) {
            setError(tokenError instanceof Error ? tokenError.message : "Could not start the verification session");
        }
    };

    useEffect(() => {
        loadToken();
        return () => {
            if (pollRef.current) {
                clearInterval(pollRef.current);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const startVerifiedPolling = () => {
        if (pollRef.current) {
            return;
        }
        setAwaitingResult(true);
        pollRef.current = setInterval(async () => {
            const profile = await getMyProfile();
            if (profile.ok && profile.data.is_verified) {
                if (pollRef.current) {
                    clearInterval(pollRef.current);
                    pollRef.current = null;
                }
                const redirectUrl =
                    typeof localStorage !== "undefined" ? localStorage.getItem("redirectUrl") : null;
                if (redirectUrl) {
                    localStorage.removeItem("redirectUrl");
                    router.push(redirectUrl);
                } else {
                    router.push("/dashboard");
                }
            }
        }, VERIFIED_POLL_INTERVAL_MS);
    };

    if (error) {
        return (
            <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 3, py: 12, px: 3 }}>
                <Typography variant="h6" sx={{ color: "navbar.primary", fontWeight: 500, textAlign: "center" }}>
                    Verification is unavailable right now
                </Typography>
                <Typography variant="subtitle1" sx={{ color: "marketplace.filterButtonText", textAlign: "center" }}>{error}</Typography>
                <Button onClick={loadToken} variant="contained" sx={{ backgroundColor: "marketplace.viewMoreButtonBackground", border: 1, borderColor: "marketplace.searchButtonBorder", color: "navbar.primary", borderRadius: 5, px: 4, py: 1 }}>
                    Try again
                </Button>
            </Box>
        );
    }

    if (!token) {
        return (
            <Box sx={{ flexGrow: 1, display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
                <CircularProgress sx={{ color: "#C6FF00" }} />
            </Box>
        );
    }

    return (
        <Box sx={{ flexGrow: 1 }}>
            {awaitingResult && (
                <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 1.5, py: 2 }}>
                    <CircularProgress size={18} sx={{ color: "#C6FF00" }} />
                    <Typography variant="subtitle2" sx={{ color: "marketplace.filterButtonText" }}>
                        Waiting for the verification result...
                    </Typography>
                </Box>
            )}
            <SumsubWebSdk
                accessToken={token}
                expirationHandler={fetchToken}
                onError={() => {
                    setError("The verification widget failed to load, please try again");
                }}
                onMessage={(message: string) => {
                    if (typeof message === "string" && message.includes("onApplicantStatusChanged")) {
                        startVerifiedPolling();
                    }
                }}
            />
        </Box>
    );
}
