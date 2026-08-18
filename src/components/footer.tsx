import { Box, Typography, Container } from "@mui/material";
import SocialLinks from "@/components/social-links";

export default function Footer() {
    return (
        <Box sx={{ bgcolor: 'navbar.background' }}>
            <Container>
                <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, alignItems: { sm: "center" }, justifyContent: "space-between", py: 3, gap: { xs: 1, sm: 0 } }}>
                    <Typography variant="subtitle1" sx={{ color: "marketplace.filterButtonText" }}>2025 All Rights Reserved</Typography>
                    <SocialLinks width={44} height={44} />
                </Box>
            </Container>
        </Box>
    )
}