"use client";

import { Box, Container, Divider, Typography, useMediaQuery } from "@mui/material";
import categoryStore from "@/store/categoryStore";
import { useRouter } from "next/navigation";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import { useEffect } from "react";
import Image from "next/image";

export default function Marketplace() {
    const isSm = useMediaQuery(theme => theme.breakpoints.down('sm'));
    const router = useRouter();

    const { categories, fetchCategories } = categoryStore()

    useEffect(() => {
        if (Object.keys(categories).length === 0) fetchCategories()
    }, []);

    return (
        <Box sx={{ backgroundColor: "marketplace.background", minHeight: "100vh", display: "flex", flexDirection: "column", textAlign: "center" }}>
            <Navbar />
            <Container sx={{ py: 3, flexGrow: 1 }}>
                <Box sx={{ my: { xs: 0, sm: 2 }, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: 'h5', sm: 'h4', horizontalTablet: 'h3' }, color: 'marketplace.categoryFilter.background' }}>
                        The world’s top assets, in one place
                    </Typography>
                    <Typography style={{ fontWeight: 500 }} sx={{ display: { xs: "none", sm: "block" }, typography: { xs: 'h6', verticalTablet: 'h5' }, color: 'navbar.primary', py: '10px' }}>
                        Choose your next investment
                    </Typography>
                    <Box sx={{ pt: { xs: "10px", sm: "0" } }}>
                        <svg width="18" height="16" viewBox="0 0 18 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M10.9795 14.5714C10.0997 16.0952 7.90028 16.0952 7.02051 14.5714L0.58718 3.42857C-0.292593 1.90476 0.807122 -1.42031e-07 2.56667 -2.95856e-07L15.4333 -1.42069e-06C17.1929 -1.57452e-06 18.2926 1.90476 17.4128 3.42857L10.9795 14.5714Z" fill="#616161" />
                        </svg>
                    </Box>
                </Box>
                <Box sx={{ my: { xs: 2.5, sm: 6 }, display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 2 }}>
                    {categories.map((category, index) => (
                        <Box onClick={() => { router.push(`/marketplace/${encodeURI(category.name)}`) }}
                            key={index} sx={{ backgroundColor: 'listingCard.background', borderRadius: '12px', textAlign: 'center', width: { xs: '45%', sm: '45%', md: '30%', lg: '23%' }, flexGrow: 1, cursor: 'pointer' }}>
                            <Image src={category.image} alt={category._id} width={0} height={0} sizes="100vw" style={{ width: '100%', height: isSm ? '150px' : '210px', objectFit: 'cover' }} />
                            <Typography sx={{ typography: { xs: "subtitle1", sm: "h6" }, color: 'listingCard.text', py: { xs: 1.5, sm: 3.5 } }}>{category.name}</Typography>
                        </Box>
                    ))}
                </Box>
            </Container>
            <Divider sx={{ backgroundColor: '#343434' }} />
            <Footer />
        </Box>
    )
}