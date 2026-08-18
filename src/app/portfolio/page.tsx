"use client";

import { useActiveAccount, useActiveWalletConnectionStatus, useConnectModal, useSendAndConfirmTransaction, useWalletBalance } from "thirdweb/react";
import { Box, Container, Divider, Tabs, Tab, Typography, Button, CircularProgress } from "@mui/material";
import TableCell, { tableCellClasses } from '@mui/material/TableCell';
import ListingCard, { NFTOwner } from "@/components/listing-card";
import TransferModal from "@/components/assets/transfer-modal";
import { connectWalletConfig } from "@/utils/thirdwebConfig";
import { defineChain, prepareContractCall } from "thirdweb";
import TableContainer from '@mui/material/TableContainer';
import { BusinessUser, RetailUser } from "@/types/Users";
import { client, contract } from "@/lib/thirdWebClient";
import { db, firebaseApp } from "@/lib/firebaseClient";
import { Listing as TListing } from "@/types/Listing";
import currencyStore from "@/store/currencyStore";
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import { styled } from '@mui/material/styles';
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import assetStore from "@/store/assetStore";
import { Holding } from "@/types/Holding";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import nftStore from "@/store/nftStore";
import Table from '@mui/material/Table';
import { unlistNFT } from "@/utils/ABI";
import { Asset } from "@/types/Asset";
import { NFT } from "@/types/NFT";
import Link from "next/link";

interface TabPanelProps {
    children?: React.ReactNode;
    index: number;
    value: number;
}

function CustomTabPanel(props: TabPanelProps) {
    const { children, value, index, ...other } = props;

    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`simple-tabpanel-${index}`}
            aria-labelledby={`simple-tab-${index}`}
            {...other}
        >
            {value === index && <Box>{children}</Box>}
        </div>
    );
}

function a11yProps(index: number) {
    return {
        id: `simple-tab-${index}`,
        'aria-controls': `simple-tabpanel-${index}`,
    };
}

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

type Listing = {
    initialInvestment: number,
    currentMarketValue: number,
    holding: Holding,
    asset: Asset
    nft: NFT,
    nftOwner: NFTOwner,
    listing?: TListing
}
type Transaction = {
    type: string,
    listedOn: string,
    assetName: string,
    category: string,
    // status: string,
    fractionAmount: number,
    fractionValue: number,
    blockchainTx?: string
}

export default function PortfolioPage() {
    const router = useRouter();

    const { mutate: sendAndConfirmTx, error: txError, isPending, isSuccess, data } = useSendAndConfirmTransaction();

    const { assets, fetchAssets } = assetStore();
    const { currencies } = currencyStore();
    const { nfts } = nftStore();

    const wallet = useActiveAccount();
    const status = useActiveWalletConnectionStatus();
    const { connect, isConnecting } = useConnectModal();
    const { data: balance, isLoading, isError } = useWalletBalance({
        chain: defineChain(parseInt(process.env.NEXT_PUBLIC_THIRDWEB_CHAIN_ID!)),
        address: wallet?.address,
        client: client,
        tokenAddress: process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS!
    });

    const [value, setValue] = useState(0);
    const [loading, setLoading] = useState(true);
    const [displayedLength, setDisplayedLength] = useState(3);
    const [transactionsDisplayedLength, setTransactionsDisplayedLength] = useState(10);
    const [purchases, setPurchases] = useState<Listing[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [transferListing, setTransferListing] = useState<{
        holding: Holding,
        asset: Asset,
        nft: NFT
    } | null>(null);
    const [userProfile, setUserProfile] = useState<RetailUser | null>(null);
    const [nftTransferSuccess, setNftTransferSuccess] = useState(false);
    const [unlisting, setUnlisting] = useState<Listing | null>(null);

    const handleChange = (event: React.SyntheticEvent, newValue: number) => {
        setValue(newValue);
    };

    useEffect(() => {
        if (wallet) {
            db.collection('RetailUser').doc(wallet.address).get().then((doc) => {
                if (doc.exists) {
                    const userData = doc.data() as RetailUser;
                    setUserProfile(userData);
                    if (!assets.length) {
                        fetchAssets().then((newAssets) => {
                            if (newAssets.length === 0) {
                                setLoading(false)
                            }
                        });
                    }
                }
                else {
                    router.push('/');
                }
            })
        }
        else if (status === 'disconnected') {
            connect(connectWalletConfig()).catch(() => { setLoading(false) });
        }
    }, [status, wallet]);
    useEffect(() => {
        (async function () {
            if (wallet && assets.length && nfts.length) {
                const userTransactions: Transaction[] = [];
                const transactionSnapshot2 = await db.collection('Transaction').where('fromWallet', '==', wallet.address).get();
                const transactionSnapshot3 = await db.collection('Transaction').where('toWallet', '==', wallet.address).get();
                let transactionsData = [
                    ...transactionSnapshot2.docs.map((doc) => ({ _id: doc.id, ...doc.data() })) as any[],
                    ...transactionSnapshot3.docs.map((doc) => ({ _id: doc.id, ...doc.data() })) as any[]
                ]
                transactionsData = transactionsData.filter((transaction, index, self) => index === self.findIndex((t) => (t._id === transaction._id)));
                transactionsData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                const purchases: Listing[] = [];
                const querySnapshot = await db.collection('RetailUser').doc(wallet.address).collection('Holding').get();
                await Promise.all(querySnapshot.docs.map(async (doc) => {
                    const fetchedHoldingsData = doc.data() as Holding;
                    const asset = assets.find(asset => asset._id === fetchedHoldingsData.assetId.toString());
                    if (asset) {
                        const nft = nfts.find(nft => nft.nftId === Number(asset._id));
                        if (nft) {
                            const holding = { _id: doc.id, ...doc.data() } as Holding;
                            const listingSnapshot = await db.collection('Asset').doc(asset._id).collection('Listing').where('listerId', '==', wallet.address).get();
                            const listing = listingSnapshot.docs.length > 0 ? { _id: listingSnapshot.docs[0].id, ...listingSnapshot.docs[0].data() } as TListing : undefined;

                            const nftOwnerSnapshot = await db.collection('BusinessUser').doc(nft.nftOwner).get();
                            const nftOwnerData = nftOwnerSnapshot.data() as BusinessUser | undefined;
                            const nftOwner: NFTOwner = {
                                username: nftOwnerData?.displayName || '',
                                logo: nftOwnerData?.logo,
                            }

                            const initialInvestment = transactionsData.filter(transaction => transaction.assetId.toString() === asset._id && transaction.fee !== 0 && transaction.fromWallet === wallet.address).reduce((acc, transaction) => acc + (transaction.quantity * transaction.pricePerFraction), 0);
                            if (fetchedHoldingsData.lockedQuantity > 0 && listing) {
                                purchases.push({
                                    initialInvestment,
                                    currentMarketValue: holding.quantity * asset.pricePerFraction,
                                    holding,
                                    asset,
                                    nft,
                                    nftOwner,
                                    listing
                                })
                            }
                            else if (fetchedHoldingsData.quantity > 0) {
                                purchases.push({
                                    initialInvestment,
                                    currentMarketValue: holding.quantity * asset.pricePerFraction,
                                    holding,
                                    asset,
                                    nft,
                                    nftOwner,
                                    listing
                                })
                            }
                        }
                    }
                }));

                transactionsData.forEach((transactionData) => {
                    const asset = assets.find(asset => asset._id === transactionData.assetId.toString());
                    if (asset) {
                        const nft = nfts.find(nft => nft.nftId === Number(asset._id));
                        if (nft) {
                            const transaction = {
                                type: transactionData.fee === 0 ? "transfer" : transactionData.fromWallet === wallet?.address ? "purchase" : transactionData.toWallet === wallet?.address ? "sale" : "other",
                                listedOn: new Date(transactionData.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
                                assetName: nft.metadata.nftName,
                                category: nft.metadata.assetClass,
                                // status: transactionData.eventType === 'purchase' ? 'Completed' : transactionData.eventType === 'unlist' ? 'Unlisted' : 'Listed',
                                fractionAmount: transactionData.quantity,
                                fractionValue: transactionData.pricePerFraction,
                                blockchainTx: transactionData.txHash
                            } as Transaction;
                            userTransactions.push(transaction);
                        }
                    }
                });

                setTransactions(userTransactions);
                setPurchases(purchases);
                setLoading(false);
            }
        }())
    }, [wallet, assets, nfts, userProfile, nftTransferSuccess]);

    async function updateDB(listing: Listing) {
        if (!wallet) return;

        const listings = await db.collection('Asset').doc(listing.asset._id).collection('Listing').get();
        const listingsData = listings.docs.map((doc) => ({ _id: doc.id, ...doc.data() })) as TListing[];
        const listingData = listingsData.filter((listing) => listing.listerId === wallet.address);
        if (listingData.length) {
            const listingsWithoutCurrent = listingsData.filter((listing) => listing.listerId !== wallet.address).sort((a, b) => a.pricePerFraction - b.pricePerFraction);
            await db.collection('Asset').doc(listing.asset._id).collection('Listing').doc(listingData[0]._id).delete();
            await db.collection('Asset').doc(listing.asset._id).update({
                availableSupply: firebaseApp.firestore.FieldValue.increment(-listingData[0].quantity),
                pricePerFraction: listingsWithoutCurrent.length ? listingsWithoutCurrent[0].pricePerFraction : 0,
            });
            await db.collection("RetailUser").doc(wallet?.address).collection('Holding').doc(listing.holding._id).update({
                lockedQuantity: firebaseApp.firestore.FieldValue.increment(-listingData[0].quantity),
            });
        }
        fetchAssets().then(() => { setUnlisting(null); });
    }
    useEffect(() => {
        if (isSuccess && data && unlisting) {
            updateDB(unlisting)
        }
    }, [isSuccess])

    async function unlist(listing: Listing) {
        if (!listing.listing) return;

        setUnlisting(listing);
        const transaction = prepareContractCall({
            contract,
            method: unlistNFT,
            params: [BigInt(listing.nft.nftId), BigInt(listing.listing.pricePerFraction * 1e6)]
        });
        sendAndConfirmTx(transaction);
    }

    return (
        <Box sx={{ backgroundColor: "marketplace.background", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
            {userProfile && <TransferModal
                router={router}
                setNftTransferSuccess={setNftTransferSuccess}
                listing={transferListing} setModal={() => { setTransferListing(null); }}
                currency={{
                    name: userProfile.settings?.currency || 'USD',
                    value: userProfile.settings ? currencies[userProfile.settings.currency] : 1
                }} />}

            <Navbar />
            <Container sx={{ pt: 3, flexGrow: 1 }}>
                <Tabs value={value} onChange={handleChange} sx={{
                    borderBottom: 1,
                    borderColor: '#424242',
                    width: '100%',
                    mb: 4.5,
                    "& .MuiTabs-flexContainer": {
                        "& .Mui-selected": {
                            color: 'navbar.primary'
                        }
                    },
                    "& .MuiTabs-indicator": {
                        backgroundColor: 'marketplace.categoryFilter.background'
                    }
                }}>
                    <Tab label="Performance metrics" sx={{ color: '#9E9E9E', flex: 1, maxWidth: "100%" }} {...a11yProps(0)} />
                    <Tab label="Trading History" sx={{ color: '#9E9E9E', flex: 1, maxWidth: "100%" }} {...a11yProps(1)} />
                </Tabs>
                <CustomTabPanel value={value} index={0}>
                    {
                        loading || isLoading ?
                            <>
                                <Box sx={{ mt: 5, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                    <CircularProgress sx={{ color: '#C6FF00' }} />
                                </Box>
                            </>
                            :
                            !wallet ?
                                <Box sx={{ mt: 5, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                    <Typography style={{ fontWeight: 500 }} variant="h5" sx={{ color: "navbar.primary" }}>Connect Wallet to Check Portfolio</Typography>
                                </Box>
                                :
                                <>
                                    <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h6", verticalTablet: "h5" }, color: 'navbar.primary' }}>General statistics of the portfolio</Typography>
                                    <Box sx={{ mt: 4, display: 'flex', alignItems: 'center', gap: 1, flexWrap: "wrap" }}>
                                        {[
                                            {
                                                heading: `$${transactions.filter((item) => item.type === 'purchase').reduce((acc, item) => acc + (item.fractionAmount * item.fractionValue), 0)}`,
                                                value: 'Total Investment Value'
                                            },
                                            {
                                                heading: purchases.length ? `${(((purchases.reduce((acc, item) => acc + item.currentMarketValue, 0) - purchases.reduce((acc, item) => acc + item.initialInvestment, 0)) / purchases.reduce((acc, item) => acc + item.initialInvestment, 0)) * 100).toFixed(2)}%` : '0%',
                                                value: 'Portfolio ROI'
                                            },
                                            {
                                                heading: `${balance?.displayValue.slice(0, 6)} ${balance?.name} available`,
                                                value: 'Balance available for reinvestment'
                                            },
                                            {
                                                heading: purchases.length ? `$${purchases.reduce((acc, item) => acc + item.initialInvestment, 0) / purchases.length} per asset` : '$0',
                                                value: 'Average amount allocated to each investment'
                                            },
                                        ].map((item, index) => (
                                            <Box key={index} sx={{ flex: 1, px: { xs: 1.5, sm: 3 }, py: { xs: 2, sm: 5.5 }, backgroundColor: "navbar.background", border: 1, borderColor: "border", height: { xs: "100%", sm: "212px" }, borderRadius: "10px", flexBasis: { xs: "100%", sm: "23%" } }}>
                                                <Typography style={{ fontWeight: 700 }} sx={{ typography: { xs: "subtitle1", sm: "h6", horizontalTablet: "h5" }, color: 'navbar.primary' }}>{item.heading}</Typography>
                                                <Typography sx={{ typography: { xs: "subtitle2", sm: "subtitle1", horizontalTablet: "h6" }, color: 'portfolio.secondaryText' }}>{item.value}</Typography>
                                            </Box>
                                        ))}
                                    </Box>
                                    <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h6", verticalTablet: "h5" }, color: 'navbar.primary', mt: 8, display: purchases.length ? 'block' : 'none' }}>
                                        Acquired assets statistics
                                    </Typography>
                                    {purchases
                                        .slice(0, displayedLength).sort((a, b) => new Date(b.holding.createdAt).getTime() - new Date(a.holding.createdAt).getTime()).map((item, index) => {
                                            return (
                                                <Box key={index} sx={{ mt: { xs: 6, sm: 4 }, display: 'flex', gap: { xs: 1, sm: 3 }, flexDirection: { xs: "column", sm: "row" } }}>
                                                    <ListingCard item={item} setTransferListing={setTransferListing} />
                                                    <Box sx={{ flex: 1, backgroundColor: "assetPurchase.documentRedirectBackground", px: { xs: 2, verticalTablet: 4 }, pt: { xs: 2, verticalTablet: 4 }, pb: "20px", borderRadius: "10px", display: 'flex', flexDirection: 'column' }}>
                                                        <Typography style={{ fontWeight: 700 }} sx={{ typography: { xs: "h6", sm: "h5" }, color: 'navbar.primary' }}>{item.nft.metadata.nftName}</Typography>
                                                        <Box sx={{ flexGrow: 1 }}>
                                                            <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                                                {[
                                                                    {
                                                                        heading: `${item.holding.quantity} / ${item.nft.totalSupply}`,
                                                                        value: 'Fractions Owned'
                                                                    },
                                                                    {
                                                                        heading: `$${item.initialInvestment}`,
                                                                        value: 'Initial Investment'
                                                                    },
                                                                    {
                                                                        heading: `Bought on ${new Date(item.holding.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`,
                                                                        value: 'Last Transaction'
                                                                    },
                                                                    {
                                                                        heading: `$${item.currentMarketValue}`,
                                                                        value: 'Current Market Value'
                                                                    },
                                                                    // {
                                                                    //     heading: 'Estimated Q3 2025',
                                                                    //     value: 'Next Payout Date'
                                                                    // },
                                                                    {
                                                                        heading: ((item.currentMarketValue - item.initialInvestment) / item.initialInvestment * 100).toFixed(2) + '%',
                                                                        value: 'ROI'
                                                                    },
                                                                    {
                                                                        heading: item.listing ? "Listed" : (item.asset.initialSupply - item.asset.availableSupply) === item.nft.totalSupply ? 'Sold' : 'Active',
                                                                        value: 'Status'
                                                                    },
                                                                    // {
                                                                    //     heading: '$500 expected in Q3 2025',
                                                                    //     value: 'Dividends Earned'
                                                                    // },
                                                                ].map((item, index) => (
                                                                    <Box key={index} sx={{ flex: 1, p: 2, backgroundColor: "marketplace.categoryFilter.text", border: 1, borderColor: "assetPurchase.documentRedirectBorder", borderRadius: "5px", minWidth: { xs: "100%", verticalTablet: "45%" } }}>
                                                                        <Typography style={{ fontWeight: 500 }} variant="subtitle1" sx={{ color: 'navbar.primary' }}>{item.heading}</Typography>
                                                                        <Typography variant="subtitle2" sx={{ color: 'assetPurchase.documentRedirectSecondaryText' }}>{item.value}</Typography>
                                                                    </Box>
                                                                ))}
                                                            </Box>
                                                        </Box>
                                                        <Button
                                                            onClick={() => setTransferListing({
                                                                holding: item.holding,
                                                                asset: item.asset,
                                                                nft: item.nft
                                                            })}
                                                            endIcon={<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                                <path d="M8.43997 11.2047L11.4385 2.40906C11.7383 1.55948 10.8888 0.709895 10.0392 1.00975L1.2435 4.00828C0.24399 4.3581 0.24399 5.75742 1.29347 6.05727L4.24203 6.85688C4.89171 7.05678 5.44144 7.55653 5.59136 8.20621L6.39097 11.1548C6.69083 12.2043 8.09014 12.2043 8.43997 11.2047Z" fill="#ECEFF1" />
                                                            </svg>}
                                                            sx={{ borderRadius: '40px', backgroundColor: 'marketplace.viewMoreButtonBackground', width: "100%", py: 1, px: 2.5, textTransform: "capitalize", mt: 2, display: { xs: "none", sm: (item.holding.quantity - item.holding.lockedQuantity) > 0 ? 'flex' : 'none' }, border: 1, borderColor: "marketplace.searchButtonBorder" }}>
                                                            <Typography style={{ fontWeight: 500 }} sx={{ color: "listingCard.buttonText", whiteSpace: "nowrap" }} variant="subtitle2">Send Fractions</Typography>
                                                        </Button>
                                                        <Button
                                                            onClick={() => router.push(`/portfolio/${item.holding._id}/${item.listing?._id}`)}
                                                            sx={{ borderRadius: '40px', backgroundColor: 'marketplace.viewMoreButtonBackground', width: "100%", py: 1, px: 2.5, textTransform: "capitalize", mt: 2, display: { xs: item.listing ? 'flex' : 'none' }, border: 1, borderColor: "marketplace.searchButtonBorder", gap: 1 }}>
                                                            <Typography style={{ fontWeight: 500 }} sx={{ color: "listingCard.buttonText", whiteSpace: "nowrap" }} variant="subtitle2">Update</Typography>
                                                        </Button>
                                                        <Button
                                                            disabled={unlisting?.holding._id === item.holding._id}
                                                            onClick={() => unlist(item)}
                                                            sx={{ borderRadius: '40px', backgroundColor: 'marketplace.viewMoreButtonBackground', width: "100%", py: 1, px: 2.5, textTransform: "capitalize", mt: 2, display: { xs: item.listing ? 'flex' : 'none' }, border: 1, borderColor: "marketplace.searchButtonBorder", gap: 1 }}>
                                                            <Typography style={{ fontWeight: 500 }} sx={{ color: "listingCard.buttonText", whiteSpace: "nowrap" }} variant="subtitle2">Unlist</Typography>
                                                            {unlisting?.holding._id === item.holding._id && <CircularProgress size={20} sx={{ color: "navbar.primary" }} />}
                                                        </Button>
                                                    </Box>
                                                </Box>
                                            )
                                        }
                                        )}
                                    <Box onClick={() => setDisplayedLength(displayedLength + 3)} sx={{ display: purchases.length > displayedLength ? 'flex' : 'none', justifyContent: 'center', mt: 6, alignItems: 'center' }}>
                                        <Box sx={{ cursor: "pointer", backgroundColor: "marketplace.viewMoreButtonBackground", color: "marketplace.searchButtonText", border: 1, borderColor: "marketplace.searchButtonBorder", borderRadius: 5, px: 3, py: 1, fontFamily: 'Roboto' }}>View More</Box>
                                    </Box>
                                </>
                    }
                </CustomTabPanel>
                <CustomTabPanel key={2} value={value} index={1}>
                    <Typography style={{ fontWeight: 500 }} variant="h5" sx={{ mt: 6, color: "navbar.primary" }}>Buy/Sell Transactions</Typography>
                    <TableContainer sx={{ mt: 3.5 }}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <StyledTableCell>Listed On</StyledTableCell>
                                    <StyledTableCell>Type</StyledTableCell>
                                    <StyledTableCell>Asset Name</StyledTableCell>
                                    <StyledTableCell>Category</StyledTableCell>
                                    {/* <StyledTableCell>Status</StyledTableCell> */}
                                    <StyledTableCell>Fraction Amount</StyledTableCell>
                                    <StyledTableCell>Fraction Price</StyledTableCell>
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
                                {transactions.slice(0, transactionsDisplayedLength).map((row, index) => (
                                    <StyledTableRow key={index}>
                                        <StyledTableCell>{row.listedOn}</StyledTableCell>
                                        <StyledTableCell>{row.type.charAt(0).toUpperCase() + row.type.slice(1)}</StyledTableCell>
                                        <StyledTableCell>{row.assetName}</StyledTableCell>
                                        <StyledTableCell>{row.category}</StyledTableCell>
                                        {/* <StyledTableCell>{row.status}</StyledTableCell> */}
                                        <StyledTableCell>{row.fractionAmount}</StyledTableCell>
                                        <StyledTableCell>{row.fractionValue}</StyledTableCell>
                                        <StyledTableCell>
                                            <Box sx={{ display: row.blockchainTx ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center' }}>
                                                <Link href={`${process.env.NEXT_PUBLIC_BLOCKCHAIN_EXPLORER_URL}/tx/${row.blockchainTx}`}>
                                                    <svg width="24" height="25" viewBox="0 0 24 25" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                        <path d="M15.0002 15.9493V9.94927M15.0002 9.94927H9.00019M15.0002 9.94927L9.00019 15.9492M7.8 21.9492H16.2C17.8802 21.9492 18.7202 21.9492 19.362 21.6222C19.9265 21.3346 20.3854 20.8757 20.673 20.3112C21 19.6695 21 18.8294 21 17.1492V8.74922C21 7.06906 21 6.22898 20.673 5.58725C20.3854 5.02276 19.9265 4.56382 19.362 4.2762C18.7202 3.94922 17.8802 3.94922 16.2 3.94922H7.8C6.11984 3.94922 5.27976 3.94922 4.63803 4.2762C4.07354 4.56382 3.6146 5.02276 3.32698 5.58725C3 6.22898 3 7.06906 3 8.74922V17.1492C3 18.8294 3 19.6695 3.32698 20.3112C3.6146 20.8757 4.07354 21.3346 4.63803 21.6222C5.27976 21.9492 6.11984 21.9492 7.8 21.9492Z" stroke="#FAFAFA" strokeLinecap="round" strokeLinejoin="round" />
                                                    </svg>
                                                </Link>
                                            </Box>
                                        </StyledTableCell>
                                    </StyledTableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6, alignItems: 'center' }}>
                        <Button onClick={() => setTransactionsDisplayedLength(transactionsDisplayedLength + 10)} variant="contained" sx={{ display: transactions.length > transactionsDisplayedLength ? 'block' : 'none', backgroundColor: '#424242', color: '#FFFFFF', borderRadius: 5, px: 3, py: 1, fontFamily: 'Roboto' }}>View More</Button>
                    </Box>
                </CustomTabPanel>
            </Container>
            <Divider sx={{ backgroundColor: '#343434', mt: 10 }} />
            <Footer />
        </Box >
    );
}