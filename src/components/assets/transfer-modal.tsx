"use client";

import { Box, Button, Typography, Modal, CircularProgress, TextField } from '@mui/material'
import { useActiveAccount, useSendAndConfirmTransaction } from 'thirdweb/react';
import { getContractByAddress } from '@/lib/thirdWebClient';
import { db, firebaseApp } from '@/lib/firebaseClient';
import categoryStore from '@/store/categoryStore';
import { prepareContractCall } from "thirdweb";
import { useEffect, useState } from 'react';
import { Holding } from '@/types/Holding';
import { Asset } from '@/types/Asset';
import { NFT } from '@/types/NFT';
import Image from 'next/image'

export default function TransferModal(props: {
    router: any,
    setNftTransferSuccess: (value: boolean) => void,
    currency: {
        name: string,
        value: number
    },
    listing: {
        holding: Holding,
        asset: Asset,
        nft: NFT
    } | null,
    setModal: Function
}) {
    const { mutate: sendAndConfirmTx, error: txError, isPending, isSuccess, data } = useSendAndConfirmTransaction();
    const wallet = useActiveAccount();

    const { categories, fetchCategories } = categoryStore()

    const [error, setError] = useState('');
    const [walletAddress, setWalletAddress] = useState('');
    const [transferSuccess, setTransferSuccess] = useState(false);
    const [remainingFractions, setRemainingFractions] = useState(0);
    const [noOfFractionsToSend, setNoOfFractionsToSend] = useState(1);

    useEffect(() => {
        if (categories.length === 0) {
            fetchCategories();
        }
        if (props.listing) {
            setRemainingFractions(props.listing.holding.quantity - props.listing.holding.lockedQuantity);
        }
    }, [props.listing]);

    useEffect(() => {
        if (isSuccess) {
            if (wallet && props.listing) {
                db.collection('RetailUser').doc(wallet.address).collection('Holding').doc(props.listing.holding._id).update({
                    quantity: firebaseApp.firestore.FieldValue.increment(-noOfFractionsToSend),
                });
                db.collection('RetailUser').doc(walletAddress).collection('Holding').where('assetId', '==', props.listing.holding.assetId).get().then((querySnapshot) => {
                    if (props.listing) {
                        if (querySnapshot.empty) {
                            db.collection('RetailUser').doc(walletAddress).collection('Holding').add({
                                createdAt: new Date().toISOString(),
                                assetCategory: props.listing.holding.assetCategory,
                                assetId: props.listing.holding.assetId,
                                averageEntryPrice: 0,
                                quantity: noOfFractionsToSend,
                                lockedQuantity: 0,
                            })
                        } else {
                            const holdingData = querySnapshot.docs[0].data() as Holding;
                            db.collection('RetailUser').doc(walletAddress).collection('Holding').doc(querySnapshot.docs[0].id).update({
                                quantity: firebaseApp.firestore.FieldValue.increment(noOfFractionsToSend),
                                averageEntryPrice: (holdingData.averageEntryPrice * holdingData.quantity) / (holdingData.quantity + noOfFractionsToSend)
                            });
                        }

                        const assetCategory = categories.find(category => category.name === props.listing?.nft.metadata.assetClass)?.name || 'Other';
                        db.collection('Transaction').add({
                            date: new Date().toISOString(),
                            txHash: data.transactionHash,
                            quantity: noOfFractionsToSend,
                            pricePerFraction: props.listing.nft.pricePerFraction,
                            currency: "USDC",
                            fee: 0,
                            feeCurrency: "USDC",
                            listingId: props.listing.asset._id,
                            assetId: props.listing.nft.nftId,
                            assetCategory,
                            fromWallet: walletAddress,
                            toWallet: wallet.address,
                        })

                        props.setNftTransferSuccess(true);
                        setTransferSuccess(true);
                    }
                    else {
                        setError('Something went wrong while sending fractions');
                    }
                })
            }
            else {
                setError('Something went wrong');
            }
        }
    }, [isSuccess]);

    useEffect(() => {
        document.getElementById('transfer-modal')?.scrollTo({ top: 0, behavior: 'smooth' });
    }, [error]);
    useEffect(() => {
        if (txError) {
            setError(txError.message);
        }
    }, [txError]);

    const sendFractions = async () => {
        if (props.listing === null) { return; }

        if (!wallet) { alert('Please connect your wallet'); return; }
        if (walletAddress === '') { setError('Please enter a wallet address'); return; }
        if (walletAddress === wallet.address) { setError('You cannot send fractions to yourself'); return; }
        if (!(await db.collection('RetailUser').doc(walletAddress).get()).exists) { setError('Wallet address does not exist on Fractionaire'); return; }

        if (noOfFractionsToSend < 1) { setError('Minimum amount is 1'); return; }
        if (noOfFractionsToSend > remainingFractions) { setError(`Max available is ${remainingFractions}`); return; }
        setError('');

        const tokenContract = getContractByAddress(props.listing.nft.erc20TokenAddress);
        const transaction = prepareContractCall({
            contract: tokenContract,
            method: 'function transfer(address,uint256)',
            params: [walletAddress, BigInt(noOfFractionsToSend)]
        });
        sendAndConfirmTx(transaction);
    }

    return (
        <>
            {
                props.listing === null ? null : (
                    <Modal
                        open={props.listing !== null}
                        onClose={() => props.setModal(false)}
                        aria-labelledby="modal-modal-title"
                        aria-describedby="modal-modal-description"
                    >
                        {transferSuccess ?
                            <Box sx={{ position: { sm: 'absolute' }, top: '50%', left: '50%', transform: { sm: 'translate(-50%, -50%)' }, bgcolor: 'marketplace.background', px: { xs: 3.5, sm: 5, verticalTablet: 12 }, py: 10, width: { xs: "100%", sm: "90%", horizontalTablet: "65%" }, overflowY: 'auto', height: { xs: "100%", sm: 'auto' }, display: "flex", alignItems: "center", flexDirection: "column" }}>
                                <Image src="/webp/party-popper.webp" width={100} height={100} alt="confirm" />
                                <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h6", sm: "h4" }, color: "navbar.primary", my: { xs: 3, sm: 5 } }}>Fractions sent successfully</Typography>
                                <Button onClick={() => {
                                    setTransferSuccess(false)
                                    props.setModal(false)
                                }} variant="contained" sx={{ backgroundColor: "marketplace.viewMoreButtonBackground", borderRadius: 5, border: 1, borderColor: "border", py: 1, px: 3, height: "55px", width: { xs: "290px", sm: "344px", verticalTablet: "480px" } }}>
                                    <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "subtitle1", horizontalTablet: "h6" }, color: "navbar.primary" }}>Go to portfolio</Typography>
                                </Button>
                            </Box>
                            :
                            <Box
                                id="transfer-modal"
                                sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', bgcolor: 'marketplace.background', p: { xs: 3.5, sm: 5, verticalTablet: 7.5 }, pt: 4, width: { xs: "100%", sm: "90%", horizontalTablet: "75%" }, overflowY: 'auto', maxHeight: '90vh' }}>
                                <Box sx={{ display: 'flex', justifyContent: { sm: 'space-between' } }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 2 }, flexDirection: { xs: "column", sm: "row" }, flexGrow: { xs: 1, sm: 0 } }}>
                                        <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "subtitle1", sm: "h5" }, color: "assetPurchase.modal.heading" }}>Send Fractions</Typography>
                                        <Box sx={{ display: { xs: "none", sm: "block" } }} >
                                            <svg width="1" height="20" viewBox="0 0 1 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <line x1="0.5" y1="0.571289" x2="0.499999" y2="19.5713" stroke="#9E9E9E" />
                                            </svg>
                                        </Box>
                                        <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "subtitle1", sm: "h5" }, color: "assetPurchase.modal.heading" }}>{props.listing.nft.metadata.nftName}</Typography>
                                    </Box>
                                    <svg onClick={() => props.setModal(false)} style={{ cursor: 'pointer' }} width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M15.9996 2.00009L1.85742 16.1422M15.9996 16.1421L1.85742 2" stroke="#9E9E9E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </Box>
                                {error && <Typography variant='subtitle2' sx={{ color: 'red', textAlign: { xs: 'center', sm: 'left' } }}>{error}</Typography>}
                                <Box sx={{ display: 'flex', gap: 4, mt: { xs: 1, verticalTablet: 0 }, flexDirection: { xs: "column", verticalTablet: "row" } }}>
                                    <Box sx={{ flex: 1, width: "100%" }}>
                                        <Image src={props.listing.nft.metadata.imageUrls[0] || ''} alt='' width={0} height={0} sizes="100vw" style={{ width: '100%', height: '100%', maxHeight: "469px", borderRadius: 5, objectFit: 'contain' }} />
                                    </Box>
                                    <Box sx={{ flex: 1, width: "100%" }}>
                                        <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "subtitle1", sm: "h6" }, color: "navbar.primary" }}>Select the share of the asset you want to transfer</Typography>
                                        <Box sx={{ backgroundColor: "listingCard.background", py: 1.5, px: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 3, borderRadius: 1 }}>
                                            <Typography variant='subtitle1' sx={{ color: "navbar.primary", fontWeight: 500 }}>Amount</Typography>
                                            <TextField
                                                value={noOfFractionsToSend}
                                                onChange={(e) => { setNoOfFractionsToSend(Number(e.target.value)) }}
                                                error={noOfFractionsToSend < 1 || noOfFractionsToSend > remainingFractions}
                                                helperText={noOfFractionsToSend < 1 ? "Minimum amount is 1" : noOfFractionsToSend > remainingFractions ? `Max available is ${remainingFractions}` : ""}
                                                type="number"
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
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1, flexWrap: 'wrap', cursor: 'pointer' }}>
                                            {['10%', '25%', '50%', '75%', 'Max'].map((i) => (
                                                <Box onClick={() => { setNoOfFractionsToSend(i === 'Max' ? remainingFractions : Math.round(remainingFractions * Number(i.slice(0, -1)) / 100)) }}
                                                    key={i} sx={{ backgroundColor: "listingCard.background", py: 1.5, px: 3, borderRadius: 1, flexGrow: 1 }}>
                                                    <Typography variant='subtitle1' sx={{ color: "navbar.primary", fontWeight: 500, textAlign: "center" }}>{i}</Typography>
                                                </Box>
                                            ))}
                                        </Box>
                                        <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "subtitle1", sm: "h6" }, color: "navbar.primary", mt: { xs: 3.5, sm: 6 } }}>Enter the wallet address</Typography>
                                        <TextField
                                            value={walletAddress}
                                            onChange={(e) => setWalletAddress(e.target.value)}
                                            sx={{
                                                width: "100%",
                                                input: { color: "navbar.primary" },
                                                '& .MuiInputBase-input': {
                                                    backgroundColor: 'listingCard.background',
                                                },
                                                '& .MuiOutlinedInput-root': {
                                                    '& fieldset': {
                                                        borderColor: '#212121',
                                                    }
                                                }
                                            }} />
                                        <Box sx={{ my: { xs: 3.5, sm: 6 } }}>
                                            <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "subtitle1", sm: "h6" }, color: "navbar.primary" }}>Subtotal</Typography>
                                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 3, borderBottom: 1, borderBottomColor: 'assetPurchase.documentRedirectBorder', pb: 0.5 }}>
                                                <Typography variant='body1' sx={{ color: "marketplace.filterButtonText" }}>Share of purchase</Typography>
                                                <Typography variant='body1' sx={{ color: "navbar.primary", fontWeight: 500 }}>{remainingFractions > 0 ? (noOfFractionsToSend / (remainingFractions)) * 100 : 0}%</Typography>
                                            </Box>
                                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2, borderBottom: 1, borderBottomColor: 'assetPurchase.documentRedirectBorder', pb: 0.5 }}>
                                                <Typography variant='body1' sx={{ color: "marketplace.filterButtonText" }}>Total in currency </Typography>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <Typography variant='subtitle1' sx={{ color: "navbar.primary", fontWeight: 500 }}>{props.listing.nft.pricePerFraction * noOfFractionsToSend * props.currency.value}</Typography>
                                                    <Typography variant='subtitle1' sx={{ color: "navbar.primary", fontWeight: 500, backgroundColor: "assetPurchase.currenciesDisplay", px: 1.5, borderRadius: "4px", width: "65px", textAlign: "center" }}>{props.currency.name}</Typography>
                                                </Box>
                                            </Box>
                                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2, borderBottom: 1, borderBottomColor: 'assetPurchase.documentRedirectBorder', pb: 0.5 }}>
                                                <Typography variant='body1' sx={{ color: "marketplace.filterButtonText" }}>Total in crypto</Typography>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <Typography variant='subtitle1' sx={{ color: "navbar.primary", fontWeight: 500 }}>{props.listing.nft.pricePerFraction * noOfFractionsToSend}</Typography>
                                                    <Typography variant='subtitle1' sx={{ color: "navbar.primary", fontWeight: 500, backgroundColor: "assetPurchase.currenciesDisplay", px: 1.5, borderRadius: "4px", width: "65px", textAlign: "center" }}>USDC</Typography>
                                                </Box>
                                            </Box>
                                        </Box>
                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Button disableElevation onClick={sendFractions} variant="contained" sx={{ backgroundColor: "marketplace.viewMoreButtonBackground", border: 1, borderColor: "marketplace.searchButtonBorder", borderRadius: 5, py: 1, px: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, width: { xs: "100%", sm: "auto" }, textTransform: 'none' }}>
                                                <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "subtitle1", sm: "h6" }, color: "navbar.primary" }}>Send fractions</Typography>
                                                {isPending && <CircularProgress size={20} sx={{ color: "navbar.primary" }} />}
                                            </Button>
                                        </Box>
                                    </Box>
                                </Box>
                            </Box>
                        }
                    </Modal>
                )
            }
        </>
    )
}