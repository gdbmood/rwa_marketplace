import { Box, CircularProgress, Modal, Typography } from "@mui/material";
import { Dispatch, SetStateAction, useEffect } from "react";

interface props {
    seconds: number;
    setSeconds: Dispatch<SetStateAction<number>>;
    isPending: boolean;
    error: string;
}

export default function CountdownModal({ seconds, setSeconds, isPending, error }: props) {
    useEffect(() => {
        if (error.trim() !== '') { setSeconds(0); return }

        if (isPending) {
            if (seconds === 0) {
                setSeconds(60);
            }
        }
        else if (seconds === 0) {
            return;
        }

        const interval = setInterval(() => {
            setSeconds(prev => prev - 1);
        }, 1000);
        return () => clearInterval(interval);
    }, [seconds, isPending, error]);

    return (
        <Modal
            open={seconds > 0}
            aria-labelledby="modal-modal-title"
            aria-describedby="modal-modal-description"
        >
            <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', bgcolor: 'marketplace.background', px: { xs: 3.5, sm: 5, verticalTablet: 12 }, py: 5, width: { xs: "100%", sm: "75%", horizontalTablet: "60%" }, overflowY: 'auto', height: 'auto', display: "flex", alignItems: "center", flexDirection: "column" }}>
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <CircularProgress sx={{ color: '#C6FF00' }} />
                </Box>
                <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h6", sm: "h4" }, color: "navbar.primary", my: { xs: 3 } }}>Processing your request</Typography>
                <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "subtitle1", sm: "h6" }, color: "marketplace.filterButtonText" }}>Please wait {seconds} seconds</Typography>
            </Box>
        </Modal>
    )
}