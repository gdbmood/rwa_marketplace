"use client";

import { Container, Box, Typography, Divider, Chip, Button, CircularProgress } from "@mui/material";
import { useActiveAccount, useActiveWalletConnectionStatus, useConnectModal } from "thirdweb/react";
import TableCell, { tableCellClasses } from '@mui/material/TableCell';
import ListingCard, { NFTOwner } from "@/components/listing-card";
import { connectWalletConfig } from "@/utils/thirdwebConfig";
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import { styled } from '@mui/material/styles';
import { BusinessUser } from "@/types/Users";
import assetStore from "@/store/assetStore";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebaseClient";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import Table from '@mui/material/Table';
import nftStore from "@/store/nftStore";
import { Asset } from "@/types/Asset";
import { NFT } from "@/types/NFT";
import Link from "next/link";

const StyledTableCell = styled(TableCell)(({ theme }: { theme: any }) => ({
    [`&.${tableCellClasses.head}`]: {
        fontFamily: 'Roboto',
        backgroundColor: theme.palette.marketplace?.background,
        color: theme.palette.portfolio?.tableText,
        borderColor: 'rgba(255, 255, 255, 0.12)',
        fontWeight: 500,
        fontSize: 14,
    },
    [`&.${tableCellClasses.body}`]: {
        fontSize: 14,
        color: theme.palette.portfolio?.tableText,
        borderColor: 'rgba(255, 255, 255, 0.12)',
    },
}));

const StyledTableRow = styled(TableRow)(({ theme }: { theme: any }) => ({
    '&:nth-of-type(odd)': {
        backgroundColor: theme.palette.portfolio?.tableOddRow,
    },
    '&:nth-of-type(even)': {
        backgroundColor: theme.palette.portfolio?.tableEvenRow,
    },
}));

export default function Dashboard() {
    const filterOptions = ['All', 'Listed', 'Sold'];

    const router = useRouter();

    const wallet = useActiveAccount()
    const status = useActiveWalletConnectionStatus();
    const { connect, isConnecting } = useConnectModal();

    const { nfts } = nftStore()
    const { assets, fetchAssets } = assetStore()

    const [loading, setLoading] = useState(true);
    const [selectedFilter, setSelectedFilter] = useState(0);
    const [displayedLength, setDisplayedLength] = useState(10);
    const [currentUser, setCurrentUser] = useState<BusinessUser | null>(null);
    const [listings, setListings] = useState<{ asset: Asset; nft: NFT, nftOwner: NFTOwner }[]>([]);
    const [isVerified, setIsVerified] = useState(false);

    useEffect(() => {
        if (wallet && !isConnecting) {
            db.collection('BusinessUser').doc(wallet.address).get().then((doc) => {
                if (doc.exists) {
                    const userData = doc.data() as BusinessUser
                    if (!userData?.isVerified) {
                        localStorage.setItem('redirectUrl', '/dashboard');
                        router.push('/verify-business');
                    }
                    else {
                        setCurrentUser(userData);
                        setIsVerified(true);
                        if (!assets.length) {
                            fetchAssets().then((newAssets) => {
                                if (newAssets.length === 0) {
                                    setLoading(false)
                                }
                            });
                        }
                    }
                }
                else {
                    router.push('/');
                }
            })
        }
        else if (status === 'disconnected') {
            connect(connectWalletConfig('business'));
        }
    }, [wallet, status, isConnecting]);

    async function fetchData() {
        if (wallet && assets.length && nfts.length && isVerified && currentUser) {
            const currentUserAssets = assets.filter((asset) => asset.minterId === wallet.address)
            const assetsWithNFTData: {
                asset: Asset;
                nft: NFT;
                nftOwner: NFTOwner;
            }[] = [];
            currentUserAssets.map((asset) => {
                const nft = nfts.find(nft => nft.nftId === Number(asset._id))
                if (nft) {
                    assetsWithNFTData.push({ asset, nft, nftOwner: { username: currentUser.displayName, logo: currentUser.logo } });
                }
            });
            setListings(assetsWithNFTData.sort((a, b) => new Date(b.asset.createdAt).getTime() - new Date(a.asset.createdAt).getTime()))
            setLoading(false);
        }
    }
    useEffect(() => { fetchData() }, [assets, nfts, isVerified, currentUser]);

    return (
        <Box sx={{ backgroundColor: 'marketplace.background', minHeight: "100vh", display: "flex", flexDirection: "column" }}>
            <Navbar />
            <Container sx={{ flexGrow: 1 }}>
                <Typography variant="subtitle2" sx={{ color: 'navbar.primary', fontWeight: 500, mt: 5 }}>Overview of tokenized assets</Typography>
                <Divider sx={{ borderColor: 'marketplace.categoryFilter.background' }} />
                <Typography variant="h5" sx={{ color: 'navbar.primary', fontWeight: 500, mt: 5 }}>Summary Metrics</Typography>
                {
                    loading ?
                        <>
                            <Box sx={{ mt: 5, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                <CircularProgress sx={{ color: '#C6FF00' }} />
                            </Box>
                        </>
                        :
                        <>
                            <Box sx={{ display: 'flex', mt: 4, gap: 1, flexWrap: 'wrap' }}>
                                <Typography variant="subtitle1" sx={{ color: 'navbar.primary' }}>Sort by</Typography>
                                {filterOptions.map((text, index) => (
                                    <Chip key={index} label={text} sx={{
                                        flexGrow: { xs: 1, sm: 0 },
                                        backgroundColor: selectedFilter === index ? 'marketplace.categoryFilter.background' : 'navbar.background',
                                        border: selectedFilter === index ? '' : 1,
                                        borderColor: selectedFilter === index ? '' : 'border',
                                        color: selectedFilter === index ? 'marketplace.categoryFilter.text' : 'marketplace.filterButtonText',
                                        '&:hover': {
                                            backgroundColor: selectedFilter === index ? 'marketplace.categoryFilter.background' : 'navbar.background',
                                            border: selectedFilter === index ? '' : 1,
                                            borderColor: selectedFilter === index ? '' : 'border',
                                            color: selectedFilter === index ? 'marketplace.categoryFilter.text' : 'marketplace.filterButtonText'
                                        }
                                    }}
                                        onClick={() => setSelectedFilter(index)} />
                                ))}
                            </Box>
                            <Box sx={{ mt: { xs: 3, sm: 5, horizontalTablet: 7 }, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: { xs: 1, sm: 2.5 } }}>
                                {listings.filter((listing) => selectedFilter === 0 || (selectedFilter === 1 && listing.asset.availableSupply !== 0) || (selectedFilter === 2 && listing.asset.availableSupply === 0)).map((item, index) => (
                                    <ListingCard key={index} item={item} />
                                ))}
                            </Box>
                            <Box sx={{ mt: 1.5, display: 'flex', justifyContent: { sm: 'center' }, gap: 1 }}>
                                <Box sx={{ py: { xs: 3, sm: 4 }, borderRadius: "10px", px: { xs: 1.5, sm: 3 }, height: { xs: "177px", sm: "212px", horizontalTablet: "100%" }, backgroundColor: "navbar.background", border: 1, borderColor: "border", flexGrow: 1 }}>
                                    <Typography style={{ fontWeight: 700 }} sx={{ typography: { xs: "subtitle1", sm: "h6", horizontalTablet: "h5" }, color: "navbar.primary" }}>{listings.length} Assets</Typography>
                                    <Typography sx={{ typography: { xs: "subtitle2", sm: "h6" }, color: "portfolio.secondaryText" }}>Total Assets</Typography>
                                </Box>
                                <Box sx={{ py: { xs: 3, sm: 4 }, borderRadius: "10px", px: { xs: 1.5, sm: 3 }, height: { xs: "177px", sm: "212px", horizontalTablet: "100%" }, backgroundColor: "navbar.background", border: 1, borderColor: "border", flexGrow: 1 }}>
                                    <Typography style={{ fontWeight: 700 }} sx={{ typography: { xs: "subtitle1", sm: "h6", horizontalTablet: "h5" }, color: "navbar.primary" }}>${listings.reduce((acc, listing) => acc + (listing.asset.initialSupply - listing.asset.availableSupply) * listing.nft.pricePerFraction, 0)}</Typography>
                                    <Typography sx={{ typography: { xs: "subtitle2", sm: "h6" }, color: "portfolio.secondaryText" }}>Total Raised Funds</Typography>
                                </Box>
                            </Box>
                            <Typography variant="h5" sx={{ mt: 6, fontWeight: 500, color: "navbar.primary" }}>Asset Listing Table (Detailed Breakdown per Asset)</Typography>
                            <TableContainer sx={{ mt: 3.5 }}>
                                <Table>
                                    <TableHead>
                                        <TableRow>
                                            <StyledTableCell>Listed On</StyledTableCell>
                                            <StyledTableCell>Asset Name</StyledTableCell>
                                            <StyledTableCell>Category</StyledTableCell>
                                            <StyledTableCell>Status</StyledTableCell>
                                            <StyledTableCell>Total Raised</StyledTableCell>
                                            <StyledTableCell>Funding Goal</StyledTableCell>
                                            <StyledTableCell>Fractions Sold</StyledTableCell>
                                            <StyledTableCell>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    Blockchain Tx
                                                    <svg width="18" height="19" viewBox="0 0 18 19" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                        <path d="M8.98714 17.2878C13.3239 17.2878 16.8395 13.7783 16.8395 9.44906C16.8395 5.11985 13.3239 1.61035 8.98714 1.61035C4.87269 1.61035 1.49733 4.76929 1.16211 8.79014H11.5412V10.108H1.16211C1.49733 14.1288 4.87269 17.2878 8.98714 17.2878Z" fill="white" fillOpacity="0.5" />
                                                    </svg>
                                                </Box>
                                            </StyledTableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {listings.map
                                            ((row, index) => (
                                                <StyledTableRow key={index}>
                                                    <StyledTableCell component="th" scope="row">{new Date(row.asset.createdAt).toLocaleDateString()}</StyledTableCell>
                                                    <StyledTableCell>{row.nft.metadata.nftName}</StyledTableCell>
                                                    <StyledTableCell>{row.nft.metadata.assetClass}</StyledTableCell>
                                                    <StyledTableCell>{row.asset.availableSupply === 0 ? "Sold" : " Listed"}</StyledTableCell>
                                                    <StyledTableCell>${(row.asset.initialSupply - row.asset.availableSupply) * row.nft.pricePerFraction}</StyledTableCell>
                                                    <StyledTableCell>${row.nft.totalSupply * row.nft.pricePerFraction}</StyledTableCell>
                                                    <StyledTableCell>{((row.asset.initialSupply - row.asset.availableSupply) / row.nft.totalSupply) * 100}%</StyledTableCell>
                                                    <StyledTableCell sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <Link href={`${process.env.NEXT_PUBLIC_BLOCKCHAIN_EXPLORER_URL}/tx/${row.asset.txHash}`}>
                                                            <svg width="24" height="25" viewBox="0 0 24 25" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                                <path d="M15.0002 15.9493V9.94927M15.0002 9.94927H9.00019M15.0002 9.94927L9.00019 15.9492M7.8 21.9492H16.2C17.8802 21.9492 18.7202 21.9492 19.362 21.6222C19.9265 21.3346 20.3854 20.8757 20.673 20.3112C21 19.6695 21 18.8294 21 17.1492V8.74922C21 7.06906 21 6.22898 20.673 5.58725C20.3854 5.02276 19.9265 4.56382 19.362 4.2762C18.7202 3.94922 17.8802 3.94922 16.2 3.94922H7.8C6.11984 3.94922 5.27976 3.94922 4.63803 4.2762C4.07354 4.56382 3.6146 5.02276 3.32698 5.58725C3 6.22898 3 7.06906 3 8.74922V17.1492C3 18.8294 3 19.6695 3.32698 20.3112C3.6146 20.8757 4.07354 21.3346 4.63803 21.6222C5.27976 21.9492 6.11984 21.9492 7.8 21.9492Z" stroke="#FAFAFA" strokeLinecap="round" strokeLinejoin="round" />
                                                            </svg>
                                                        </Link>
                                                    </StyledTableCell>
                                                </StyledTableRow>
                                            ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                            <Box onClick={() => setDisplayedLength(displayedLength + 5)}
                                sx={{ display: listings.length > displayedLength ? 'flex' : 'none', justifyContent: 'center', mt: 6, alignItems: 'center' }}>
                                <Button variant="contained" sx={{ backgroundColor: '#424242', color: '#FFFFFF', borderRadius: 5, px: 3, py: 1, fontFamily: 'Roboto' }}>View More</Button>
                            </Box>
                        </>
                }
            </Container>
            <Divider sx={{ backgroundColor: '#343434', mt: 9 }} />
            <Footer />
        </Box>
    );
}