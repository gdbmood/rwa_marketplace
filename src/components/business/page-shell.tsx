import { Box, Divider, Typography } from "@mui/material";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import Link from "next/link";
import type { ReactNode } from "react";

/** Common frame for business pages: navbar, content column, footer. */
export function BusinessPageShell(props: { children: ReactNode }) {
    return (
        <Box sx={{ backgroundColor: "marketplace.background", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
            <Navbar />
            {props.children}
            <Divider sx={{ backgroundColor: "#343434", mt: "auto" }} />
            <Footer />
        </Box>
    );
}

/** Shown when a retail account reaches a business-only screen. */
export function NotBusinessNotice() {
    return (
        <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 2, py: 12, px: 3 }}>
            <Typography variant="h6" sx={{ color: "navbar.primary", fontWeight: 500, textAlign: "center" }}>
                This area is for business accounts
            </Typography>
            <Typography variant="subtitle1" sx={{ color: "marketplace.filterButtonText", textAlign: "center" }}>
                Your wallet is registered as an investor account. Visit the marketplace to browse assets instead.
            </Typography>
            <Link href="/" style={{ color: "#C6FF00", textDecoration: "underline" }}>
                Back to home
            </Link>
        </Box>
    );
}
