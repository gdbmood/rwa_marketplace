import { Box, CircularProgress } from "@mui/material";

export default function Loading() {
    return (
        <Box sx={{ backgroundColor: "marketplace.background", minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center" }}>
            <CircularProgress sx={{ color: "#C6FF00" }} />
        </Box>
    );
}
