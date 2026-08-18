"use client";

import { Box, Button, Container, Divider, Typography, CircularProgress, Modal, TextField } from '@mui/material'
import { useActiveAccount, useSendAndConfirmTransaction } from 'thirdweb/react';
import { useParams, useRouter } from 'next/navigation';
import { sellNFT, unlistNFT } from '@/utils/ABI';
import { contract } from '@/lib/thirdWebClient';
import { prepareContractCall } from "thirdweb";
import { useState, useEffect } from 'react';
import assetStore from '@/store/assetStore';
import { RetailUser } from '@/types/Users';
import { db } from '@/lib/firebaseClient';
import { Holding } from '@/types/Holding';
import { Listing } from '@/types/Listing';
import Footer from "@/components/footer";
import Navbar from '@/components/navbar';
import nftStore from "@/store/nftStore";
import { Asset } from '@/types/Asset';
import { NFT } from "@/types/NFT";
import Image from 'next/image';

export default function AssetSalePage() {
    const router = useRouter()
    const params = useParams<{ purchaseId: string, listingId: string }>()

    const { mutate: sendAndConfirmUnlistTx, error: unlistTxError, isPending, isSuccess: isUnlistTxSuccess } = useSendAndConfirmTransaction();
    const { mutate: sendAndConfirmTx, error: txError, isPending: isTxPending, isSuccess: isTxSuccess, data } = useSendAndConfirmTransaction();

    const wallet = useActiveAccount();

    const { assets, fetchAssets } = assetStore();
    const { nfts } = nftStore();

    const [error, setError] = useState('');
    const [user, setUser] = useState<RetailUser>();
    const [saleSuccess, setSaleSuccess] = useState<boolean>(false);
    const [fractionPrice, setFractionPrice] = useState<string>('1');
    const [listing, setListing] = useState<{ asset: Asset, holding: Holding, nft: NFT, listing: Listing }>();

    useEffect(() => { if (assets.length === 0) fetchAssets() }, []);
    useEffect(() => {
        if (wallet) {
            db.collection('RetailUser').doc(wallet.address).get().then((userDoc) => {
                if (userDoc.exists) {
                    setUser(userDoc.data() as RetailUser);
                }
            })
        }
    }, [wallet])
    useEffect(() => {
        if (wallet && assets.length > 0) {
            db.collection('RetailUser').doc(wallet.address).collection('Holding').doc(params.purchaseId).get().then(doc => {
                if (doc.exists) {
                    const holding = doc.data() as Holding;
                    const asset = assets.find(asset => asset._id === holding.assetId.toString());
                    if (asset) {
                        const nft = nfts.find(nft => nft.nftId === Number(asset._id));
                        if (nft) {
                            db.collection('Asset').doc(asset._id).collection('Listing').doc(params.listingId).get().then((doc) => {
                                if (doc.exists) {
                                    const listing = doc.data() as Listing;
                                    setListing({ asset, holding, nft, listing });
                                }
                                else {
                                    router.push('/marketplace');
                                }
                            })
                        }
                    }
                }
                else {
                    router.push('/marketplace');
                }
            }).catch(err => {
                setError(err.message);
            });
        }
    }, [wallet, assets]);

    useEffect(() => {
        if (error) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, [error]);
    useEffect(() => {
        if (unlistTxError) {
            setError(unlistTxError.message);
        }
    }, [unlistTxError]);
    useEffect(() => {
        if (txError) {
            setError(txError.message);
        }
    }, [txError]);

    async function dbUpdate() {
        if (isTxSuccess) {
            if (wallet && listing && user) {
                try {
                    const assetDoc = await db.collection('Asset').doc(listing.asset._id).get();
                    if (!assetDoc.exists) {
                        setError('Asset Document does not exist');
                        return;
                    }

                    const assetData = assetDoc.data() as Asset;
                    await db.collection('Asset').doc(listing.asset._id).collection('Listing').doc(params.listingId).update({ pricePerFraction: Math.round(Number(fractionPrice) * 1e6) / 1e6 })
                    await db.collection('Asset').doc(listing.asset._id).update({ pricePerFraction: Math.round(Number(fractionPrice) * 1e6) / 1e6 < assetData.pricePerFraction ? Math.round(Number(fractionPrice) * 1e6) / 1e6 : assetData.pricePerFraction })
                    fetchAssets();
                    setSaleSuccess(true);
                    setTimeout(() => {
                        router.push("/portfolio");
                    }, 2500);
                } catch (error: any) {
                    setError(error.message);
                }
            }
            else {
                setError('Store blockchain tx hash in firestore failed due to user not found');
            }
        }
    }
    useEffect(() => { dbUpdate() }, [isTxSuccess]);
    useEffect(() => {
        if (isUnlistTxSuccess) {
            if (listing) {
                const tx = prepareContractCall({
                    contract,
                    method: sellNFT,
                    params: [BigInt(listing.nft.nftId), BigInt(listing.listing.quantity), BigInt(Math.round(Number(fractionPrice) * 1e6))],
                });
                sendAndConfirmTx(tx);
            }
        }
    }, [isUnlistTxSuccess]);

    const updatePrice = async () => {
        if (!listing) return
        if (!wallet) { setError('Please connect your wallet'); return; }
        if (Number(fractionPrice) <= 0) { setError('Price must be greater than 0'); return; }
        if (Number(fractionPrice) < 0.000001) { setError('Price must be greater than 0.000001'); return; }

        setError('');
        const approveTx = prepareContractCall({
            contract: contract,
            method: unlistNFT,
            params: [BigInt(listing.nft.nftId), BigInt(listing.listing.pricePerFraction * 1e6)],
        });
        sendAndConfirmUnlistTx(approveTx);
    }

    return (
        <Box sx={{ backgroundColor: 'marketplace.background', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <Navbar />
            <Container sx={{ flexGrow: 1 }}>
                {!listing ?
                    <Box sx={{ mt: 5, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        <CircularProgress sx={{ color: '#C6FF00' }} />
                    </Box>
                    :
                    <>
                        <Modal
                            open={saleSuccess}
                            onClose={() => setSaleSuccess(false)}
                            aria-labelledby="modal-modal-title"
                            aria-describedby="modal-modal-description"
                        >
                            <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', bgcolor: 'marketplace.background', px: { xs: 3.5, sm: 5, verticalTablet: 12 }, py: 10, width: { xs: "100%", sm: "90%", horizontalTablet: "65%" }, overflowY: 'auto', height: 'auto', display: "flex", alignItems: "center", flexDirection: "column" }}>
                                <Image src="/webp/party-popper.webp" width={100} height={100} alt="confirm" />
                                <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h6", sm: "h4" }, color: "navbar.primary", my: { xs: 3, sm: 5 } }}>The listing was successfully updated</Typography>
                                <Button onClick={() => { router.push("/portfolio") }} variant="contained" sx={{ backgroundColor: "marketplace.viewMoreButtonBackground", borderRadius: 5, border: 1, borderColor: "marketplace.searchButtonBorder", py: 1, px: 3, height: "55px", width: { xs: "290px", sm: "344px", verticalTablet: "480px" } }}>
                                    <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "subtitle1", horizontalTablet: "h6" }, color: "navbar.primary" }}>Go to Portfolio</Typography>
                                </Button>
                            </Box>
                        </Modal>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: { xs: 4, sm: 7.5 }, flexDirection: { xs: "column", sm: "row" } }}>
                            <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h6", sm: "h5" }, color: "assetPurchase.modal.heading" }}>UPDATE PRICE</Typography>
                            <Box sx={{ display: { xs: "none", sm: "block" } }} >
                                <svg width="1" height="20" viewBox="0 0 1 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <line x1="0.5" y1="0.571289" x2="0.499999" y2="19.5713" stroke="#9E9E9E" />
                                </svg>
                            </Box>
                            <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "subtitle1", sm: "h5" }, color: "assetPurchase.modal.heading" }}>{listing.nft.metadata.nftName}</Typography>
                        </Box>
                        {error && <Typography variant='subtitle2' sx={{ color: 'red' }}>{error}</Typography>}
                        <Box sx={{ display: 'flex', gap: 4, mt: 4, flexDirection: { xs: "column", verticalTablet: "row" } }}>
                            <Box sx={{ flex: 1, width: "100%" }}>
                                <Image src={listing.nft.metadata.imageUrls[0]} alt='' width={0} height={0} sizes="100vw" style={{ width: '100%', height: '100%', maxHeight: "469px", borderRadius: 5, objectFit: 'contain' }} />
                            </Box>
                            <Box sx={{ flex: 1, width: "100%" }}>
                                <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "subtitle1", sm: "h6" }, color: "navbar.primary" }}>Price</Typography>
                                <Box sx={{ backgroundColor: "listingCard.background", py: 1.5, px: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2, mb: 4, borderRadius: 1 }}>
                                    <Typography variant='subtitle1' sx={{ color: "navbar.primary", fontWeight: 500 }}>Price per fraction</Typography>
                                    <TextField
                                        value={fractionPrice}
                                        onChange={(e) => {
                                            const value = e.target.value.split('.');
                                            if (value.length > 2) {
                                                setFractionPrice('0');
                                                return;
                                            }
                                            const wholePart = Number(value[0]);
                                            const fractionPart = value[1] ? Number(value[1]) : 0;
                                            if (isNaN(fractionPart) || isNaN(wholePart)) {
                                                return;
                                            }
                                            if (wholePart < 0) {
                                                setFractionPrice('0');
                                                return;
                                            }
                                            setFractionPrice(e.target.value);
                                        }}
                                        error={Number(fractionPrice) <= 0}
                                        helperText={Number(fractionPrice) > 0 ? "" : "Price must be greater than 0"}
                                        variant="standard" sx={{
                                            flexGrow: 1,
                                            input: { color: "navbar.primary", textAlign: "right" },
                                            "& .MuiFormHelperText-root": {
                                                textAlign: "right"
                                            },
                                            "& .MuiInput-root": {
                                                // Bottom border
                                                "&:before": {
                                                    borderColor: "listingCard.background"
                                                },
                                                // Focus bottom border
                                                "&:after": {
                                                    borderColor: "listingCard.background"
                                                },
                                                // Hover bottom border
                                                ":hover:not(.Mui-focused)": {
                                                    "&:before": {
                                                        borderColor: "listingCard.background"
                                                    },
                                                },
                                            },
                                        }} />
                                </Box>
                                <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "subtitle1", sm: "h6" }, color: "navbar.primary" }}>Payout currency</Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: "center", gap: 1.5, backgroundColor: "listingCard.background", px: 3, py: 1.5, mt: 2 }}>
                                    <Typography variant='subtitle1' sx={{ color: "navbar.primary", fontWeight: 500 }}>USDC</Typography>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <g clipPath="url(#clip0_1329_23741)">
                                            <path d="M12 24C18.65 24 24 18.65 24 12C24 5.34996 18.65 0 12 0C5.34996 0 0 5.34996 0 12C0 18.65 5.34996 24 12 24Z" fill="#2775CA" />
                                            <path d="M15.3015 13.8996C15.3015 12.1496 14.2515 11.5496 12.1515 11.2997C10.6515 11.0996 10.3515 10.6997 10.3515 9.99961C10.3515 9.29953 10.8516 8.84965 11.8515 8.84965C12.7515 8.84965 13.2516 9.14965 13.5015 9.89965C13.5516 10.0496 13.7016 10.1496 13.8516 10.1496H14.6515C14.8515 10.1496 15.0015 9.99961 15.0015 9.79969V9.74965C14.8015 8.64961 13.9015 7.79965 12.7515 7.69969V6.49969C12.7515 6.29965 12.6015 6.14965 12.3516 6.09961H11.6016C11.4015 6.09961 11.2515 6.24961 11.2015 6.49969V7.64965C9.70148 7.84969 8.75156 8.84965 8.75156 10.0997C8.75156 11.7497 9.75152 12.3996 11.8515 12.6497C13.2516 12.8997 13.7016 13.1997 13.7016 13.9997C13.7016 14.7997 13.0015 15.3497 12.0516 15.3497C10.7515 15.3497 10.3015 14.7996 10.1515 14.0496C10.1016 13.8497 9.95156 13.7496 9.80156 13.7496H8.95148C8.75156 13.7496 8.60156 13.8996 8.60156 14.0997V14.1497C8.80148 15.3996 9.60152 16.2996 11.2515 16.5497V17.7497C11.2515 17.9496 11.4015 18.0996 11.6515 18.1496H12.4015C12.6015 18.1496 12.7515 17.9997 12.8016 17.7497V16.5497C14.3016 16.2996 15.3015 15.2496 15.3015 13.8996Z" fill="white" />
                                            <path d="M9.45097 19.1499C5.55097 17.75 3.55094 13.4 5.00102 9.54992C5.75102 7.44992 7.40101 5.84996 9.45097 5.09996C9.65101 5 9.75098 4.85 9.75098 4.59992V3.89996C9.75098 3.69992 9.65101 3.54992 9.45097 3.5C9.40093 3.5 9.30098 3.5 9.25094 3.54992C4.50098 5.04992 1.90093 10.1 3.40093 14.85C4.30093 17.6499 6.45098 19.8 9.25094 20.7C9.45097 20.7999 9.65102 20.7 9.70093 20.4999C9.75098 20.45 9.75098 20.4 9.75098 20.3V19.5999C9.75098 19.4499 9.60098 19.25 9.45097 19.1499ZM14.751 3.54992C14.551 3.44996 14.3509 3.54992 14.301 3.74996C14.251 3.8 14.251 3.84992 14.251 3.95V4.64996C14.251 4.85 14.401 5.04992 14.551 5.15C18.451 6.54992 20.451 10.8999 19.0009 14.75C18.2509 16.85 16.6009 18.45 14.551 19.2C14.3509 19.2999 14.251 19.4499 14.251 19.7V20.4C14.251 20.6 14.3509 20.75 14.551 20.7999C14.601 20.7999 14.701 20.7999 14.751 20.75C19.501 19.25 22.101 14.1999 20.601 9.44996C19.701 6.59996 17.5009 4.44992 14.751 3.54992Z" fill="white" />
                                        </g>
                                        <defs>
                                            <clipPath id="clip0_1329_23741">
                                                <rect width="24" height="24" fill="white" />
                                            </clipPath>
                                        </defs>
                                    </svg>
                                </Box>
                                <Box sx={{ my: 6 }}>
                                    <Typography variant='h6' sx={{ color: "navbar.primary", fontWeight: 500 }}>Subtotal</Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 3, borderBottom: 1, borderBottomColor: 'assetPurchase.documentRedirectBorder', pb: 0.5 }}>
                                        <Typography variant='body1' sx={{ color: "marketplace.filterButtonText" }}>Total number of fractions</Typography>
                                        <Typography variant='body1' sx={{ color: "navbar.primary", fontWeight: 500 }}>{listing.listing.quantity}</Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2, borderBottom: 1, borderBottomColor: 'assetPurchase.documentRedirectBorder', pb: 0.5 }}>
                                        <Typography variant='body1' sx={{ color: "marketplace.filterButtonText" }}>You will recieve</Typography>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Typography variant='subtitle1' sx={{ color: "navbar.primary", fontWeight: 500 }}>{listing.listing.quantity * Number(fractionPrice)}</Typography>
                                            <Typography variant='subtitle1' sx={{ color: "navbar.primary", fontWeight: 500, backgroundColor: "assetPurchase.currenciesDisplay", px: 1.5, borderRadius: "4px", width: "65px", textAlign: "center" }}>USDC</Typography>
                                        </Box>
                                    </Box>
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Button
                                        onClick={updatePrice}
                                        disabled={isPending || isTxPending}
                                        disableElevation
                                        variant="contained" sx={{ backgroundColor: "marketplace.viewMoreButtonBackground", borderRadius: 5, py: 1, px: 3, width: { xs: "100%", sm: "auto" }, display: 'flex', alignItems: 'center', gap: 1, border: 1, borderColor: "marketplace.searchButtonBorder" }}>
                                        <Typography variant='h6' sx={{ color: "navbar.primary", fontWeight: 500 }}>UPDATE PRICE</Typography>
                                        {(isPending || isTxPending) && <CircularProgress size={20} sx={{ color: "navbar.primary" }} />}
                                    </Button>
                                </Box>
                            </Box>
                        </Box>
                    </>
                }
            </Container>
            <Divider sx={{ backgroundColor: '#343434', mt: { xs: 4, horizontalTablet: 9 } }} />
            <Footer />
        </Box>
    );
}