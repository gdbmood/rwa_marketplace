"use client";

import { Box, Button, Typography, Modal, CircularProgress, Chip, useMediaQuery } from '@mui/material'
import { useActiveAccount, useSendAndConfirmTransaction } from 'thirdweb/react';
import { contract, getContractByAddress } from '@/lib/thirdWebClient';
import "react-responsive-carousel/lib/styles/carousel.min.css";
import { Carousel } from 'react-responsive-carousel';
import { storage, db } from '@/lib/firebaseClient';
import currencyStore from '@/store/currencyStore';
import { Category } from '@/store/categoryStore';
import { ListingState } from '@/types/Listing';
import { prepareContractCall } from "thirdweb";
import { createListing } from '@/utils/ABI';
import { useEffect, useState } from 'react';
import { NFT } from '@/types/NFT';
import Image from 'next/image';
import { v4 } from "uuid";

export default function ListModal(props: {
    router: any,
    user: any,
    nfts: NFT[],
    categories: Category[],
    fetchNfts: () => Promise<void>,
    formData: {
        assetType: string,
        title: string,
        description: string,
        valuation: number,
        amountOfFractions: number,
        userKycRequired: boolean,
        [key: string]: any;
    },
    images: (File | string)[], documents: { [key: string]: (File | string)[] }, modal: boolean, setModal: (modal: boolean) => void
}) {
    const isSm = useMediaQuery(theme => theme.breakpoints.down('sm'));

    const { mutate: sendAndConfirmApproveTx, error: approvetxError, isSuccess: isApproveTxSuccess } = useSendAndConfirmTransaction();
    const { mutate: sendAndConfirmTx, error: txError, isPending, isSuccess, data } = useSendAndConfirmTransaction();
    const wallet = useActiveAccount();

    const { currencies } = currencyStore();

    const [error, setError] = useState('');
    const [isMiniting, setIsMinting] = useState(false);
    const [minitingSuccess, setMintingSuccess] = useState(false);
    const [internalId, setInternalId] = useState<string | null>(null);

    useEffect(() => {
        if (isSuccess) { props.fetchNfts() }
    }, [isSuccess]);
    useEffect(() => {
        if (isSuccess) {
            if (wallet) {
                const nft = props.nfts[props.nfts.length - 1];
                const tokenContract = getContractByAddress(nft.erc20TokenAddress);
                const approveTx = prepareContractCall({
                    contract: tokenContract,
                    method: 'function approve(address spender, uint256 amount) returns (bool)',
                    params: [contract.address, BigInt(props.formData.amountOfFractions)],
                });
                sendAndConfirmApproveTx(approveTx);
            }
            else {
                setError('Approve transaction failed: Please connect your wallet');
            }
        }
    }, [props.nfts]);
    useEffect(() => {
        if (isApproveTxSuccess) {
            if (data && wallet && internalId) {
                try {
                    const nft = props.nfts[props.nfts.length - 1];
                    const assetCategory = props.categories.find(c => c.name === props.formData.assetType)?._id || 'other';
                    Promise.all([
                        db.collection('Asset').doc(nft.nftId.toString()).set({
                            internalId: internalId,
                            createdAt: new Date().toISOString(),
                            txHash: data.transactionHash,
                            assetName: props.formData.title,
                            initialSupply: props.formData.amountOfFractions,
                            availableSupply: props.formData.amountOfFractions,
                            assetCategory,
                            minterId: wallet.address,
                            pricePerFraction: Math.round((props.formData.valuation / props.formData.amountOfFractions) * 1e6) / 1e6,
                        }),
                        db.collection('Asset').doc(nft.nftId.toString()).collection('Listing').add({
                            createdAt: new Date().toISOString(),
                            quantity: props.formData.amountOfFractions,
                            pricePerFraction: Math.round((props.formData.valuation / props.formData.amountOfFractions) * 1e6) / 1e6,
                            currency: 'USDC',
                            state: ListingState.ACTIVE,
                            assetId: nft.nftId,
                            listerId: wallet.address,
                            assetCategory
                        }),
                        (async () => {
                            if (props.formData.userKycRequired) {
                                await db.collection('Asset').doc(nft.nftId.toString()).collection('KYCRequirement').add({
                                    sumsubVerified: true
                                })
                            }
                        })(),
                        db.collection('Mint').add({
                            createdAt: new Date().toISOString(),
                            txHash: data.transactionHash,
                            assetId: nft.nftId,
                            mintSupply: props.formData.amountOfFractions,
                            minterId: wallet.address,
                            mintPrice: props.formData.valuation / props.formData.amountOfFractions,
                            mintCurrency: "USDC",
                            mintFee: 0
                        })
                    ]).then(() => {
                        setError('');
                        setIsMinting(false);
                        setMintingSuccess(true);
                    })
                } catch (error: any) {
                    console.log(error);
                    setError(error.message);
                }
            }
            else {
                setError('Firestore transaction failed: ' + (wallet ? 'Please try again later' : 'Please connect your wallet'));
            }
        }
    }, [isApproveTxSuccess]);

    useEffect(() => {
        if (error.trim().length > 0) {
            console.log(error);
            setIsMinting(false);
            document.getElementById('list-modal')?.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, [error]);
    useEffect(() => {
        if (txError) {
            setError(txError.message);
        }
    }, [txError]);
    useEffect(() => {
        if (approvetxError) {
            setError(approvetxError.message);
        }
    }, [approvetxError]);

    const listNFT = async () => {
        try {
            if (!wallet) { setError('Please connect your wallet'); return; }

            setError('');
            setIsMinting(true);

            const randomId = v4();
            setInternalId(randomId);
            const uploadedImagesUrls = [];
            for (let i = 0; i < props.images.length; i++) {
                const image = props.images[i];
                if (image instanceof File) {
                    const imageRef = storage.ref('assets/' + randomId + '/images/' + image.name);
                    await imageRef.put(image);
                    uploadedImagesUrls.push(await imageRef.getDownloadURL());
                }
            }
            const uploadedDocumentsUrls: { [key: string]: string[] } = {};
            for (const key in props.documents) {
                const documents = props.documents[key];
                for (let i = 0; i < documents.length; i++) {
                    const document = documents[i];
                    if (document instanceof File) {
                        const documentRef = storage.ref('assets/' + randomId + '/documents/' + document.name);
                        await documentRef.put(document);
                        if (!uploadedDocumentsUrls[key]) { uploadedDocumentsUrls[key] = []; }
                        uploadedDocumentsUrls[key].push(await documentRef.getDownloadURL());
                    }
                }
            }

            const metadata = {
                nftName: props.formData.title,
                description: props.formData.description,
                imageUrls: uploadedImagesUrls,
                documentUrls: uploadedDocumentsUrls,
                ...Object.keys(props.formData).reduce((acc: any, key: string) => {
                    if (key === "assetType" || key === "title" || key === "description" || key === "valuation" || key === "amountOfFractions") {
                        return acc;
                    }
                    acc[key] = props.formData[key];
                    return acc;
                }, {}),
                assetClass: props.formData.assetType,
            };
            const transaction = prepareContractCall({
                contract,
                method: createListing,
                params: [BigInt(props.formData.amountOfFractions), BigInt(Math.round((props.formData.valuation / props.formData.amountOfFractions) * 1e6)), JSON.stringify(metadata)]
            });
            sendAndConfirmTx(transaction);
        } catch (error: any) {
            setError(error.message);
            setIsMinting(false);
        }
    }

    return (
        <Modal
            open={props.modal}
            onClose={() => props.setModal(false)}
            aria-labelledby="modal-modal-title"
            aria-describedby="modal-modal-description"
        >
            {minitingSuccess ?
                <Box sx={{ position: { sm: 'absolute' }, top: '50%', left: '50%', transform: { sm: 'translate(-50%, -50%)' }, bgcolor: 'marketplace.background', px: { xs: 3.5, sm: 5, verticalTablet: 12 }, py: 10, width: { xs: "100%", sm: "90%", horizontalTablet: "65%" }, overflowY: 'auto', height: { xs: "100%", sm: 'auto' }, display: "flex", alignItems: "center", flexDirection: "column" }}>
                    <Image src="/webp/party-popper.webp" width={100} height={100} alt="confirm" />
                    <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h6", sm: "h4" }, color: "navbar.primary", my: { xs: 3, sm: 5 } }}>Asset listing confirmed</Typography>
                    <Button onClick={() => { props.router.push("/dashboard") }} variant="contained" sx={{ backgroundColor: "marketplace.viewMoreButtonBackground", borderRadius: 5, border: 1, borderColor: "marketplace.searchButtonBorder", py: 1, px: 3, height: "55px", width: { xs: "290px", sm: "344px", verticalTablet: "480px" } }}>
                        <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "subtitle1", horizontalTablet: "h6" }, color: "navbar.primary" }}>Go to dashboard</Typography>
                    </Button>
                </Box>
                :
                <Box
                    id="list-modal"
                    sx={{ position: { sm: 'absolute' }, top: '50%', left: '50%', transform: { sm: 'translate(-50%, -50%)' }, bgcolor: 'marketplace.background', p: { xs: 3.5, sm: 5, verticalTablet: 7.5 }, pt: 4, width: { xs: "100%", sm: "90%", horizontalTablet: "65%" }, overflowY: 'auto', height: { xs: "100%", sm: '80%' } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box>
                            <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h6", sm: "h5" }, color: "assetPurchase.modal.heading" }}>Check the publication</Typography>
                            {error && <Typography variant='subtitle2' sx={{ color: 'red' }}>{error}</Typography>}
                        </Box>
                        <svg onClick={() => props.setModal(false)} style={{ cursor: 'pointer' }} width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M15.9996 2.00009L1.85742 16.1422M15.9996 16.1421L1.85742 2" stroke="#9E9E9E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 4, mt: { xs: 2.5, sm: 4 }, flexDirection: { xs: 'column', sm: 'row' } }}>
                        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <Box sx={{
                                flexGrow: 1,
                                '& .carousel': {
                                    '& .thumb': {
                                        borderColor: '#424242'
                                    }
                                }
                            }}>
                                <Carousel showArrows={false} showStatus={false} showIndicators={false}
                                    renderThumbs={() => {
                                        return props.images.map((i, index) => (
                                            <Image key={index} src={typeof i === "string" ? i : URL.createObjectURL(i)} alt='' width={0} height={0} sizes='100vw' style={{ height: '80px', objectFit: 'cover' }} />
                                        ))
                                    }}
                                >
                                    {props.images.map((i, index) => (
                                        <Image key={index} src={typeof i === "string" ? i : URL.createObjectURL(i)} alt='' width={0} height={0} sizes='100vw' style={{ height: isSm ? '290px' : '474px', objectFit: 'cover' }} />
                                    ))}
                                </Carousel>
                            </Box>
                            <Box sx={{ backgroundColor: "assetPurchase.documentRedirectBackground", border: 1, borderColor: "assetPurchase.documentRedirectBorder", borderRadius: 1, py: 1.5, px: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Box>
                                    <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "subtitle2", horizontalTablet: "subtitle1" }, color: "navbar.primary" }}>Documents confirming ownership</Typography>
                                    <Typography variant='subtitle2' sx={{ color: "assetPurchase.documentRedirectSecondaryText" }}>Download and view documents</Typography>
                                </Box>
                                <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path opacity="0.4" d="M27.5 21.25V12.5C27.5 9.73858 25.2614 7.5 22.5 7.5H19.1667C18.0848 7.5 17.0321 7.14911 16.1667 6.5L13.8333 4.75C12.9678 4.10089 11.9152 3.75 10.8333 3.75H7.5C4.73858 3.75 2.5 5.98858 2.5 8.75V21.25C2.5 24.0114 4.73858 26.25 7.5 26.25H22.5C25.2614 26.25 27.5 24.0114 27.5 21.25Z" fill="#FAFAFA" />
                                    <path fillRule="evenodd" clipRule="evenodd" d="M14.0625 17.7146C14.0042 17.6708 13.9482 17.6223 13.8951 17.5692L11.9129 15.587C11.5468 15.2209 10.9532 15.2209 10.5871 15.587C10.221 15.9531 10.221 16.5467 10.5871 16.9128L12.5693 18.895C13.9117 20.2375 16.0883 20.2375 17.4307 18.895L19.4129 16.9128C19.779 16.5467 19.779 15.9531 19.4129 15.587C19.0468 15.2209 18.4532 15.2209 18.0871 15.587L16.1049 17.5692C16.0518 17.6223 15.9958 17.6708 15.9375 17.7146V12.4999C15.9375 11.9821 15.5178 11.5624 15 11.5624C14.4822 11.5624 14.0625 11.9821 14.0625 12.4999V17.7146Z" fill="#FAFAFA" />
                                </svg>
                            </Box>
                        </Box>
                        <Box sx={{ flex: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: "center", gap: 2, flexWrap: 'wrap' }}>
                                <Chip sx={{ color: "marketplace.filterButtonText", border: 1, borderColor: "border", fontFamily: "Roboto", py: 1, px: 2.5, flexGrow: 1 }} label={props.user?.displayName} />
                                <Chip sx={{ color: "marketplace.filterButtonText", border: 1, borderColor: "border", fontFamily: "Roboto", py: 1, px: 2.5, flexGrow: 1 }} label={props.formData.assetType} />
                                <Chip sx={{ border: 1, borderColor: "border", color: "marketplace.filterButtonText", p: 0.5, flexGrow: 1 }} label={
                                    <svg width="21" height="16" viewBox="0 0 21 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <g clipPath="url(#clip0_334_12559)">
                                            <mask id="mask0_334_12559" maskUnits="userSpaceOnUse" x="0" y="0" width="21" height="16">
                                                <path d="M19 0.5H2C0.89543 0.5 0 1.39543 0 2.5V13.5C0 14.6046 0.89543 15.5 2 15.5H19C20.1046 15.5 21 14.6046 21 13.5V2.5C21 1.39543 20.1046 0.5 19 0.5Z" fill="white" />
                                            </mask>
                                            <g mask="url(#mask0_334_12559)">
                                                <path d="M19 0.5H2C0.89543 0.5 0 1.39543 0 2.5V13.5C0 14.6046 0.89543 15.5 2 15.5H19C20.1046 15.5 21 14.6046 21 13.5V2.5C21 1.39543 20.1046 0.5 19 0.5Z" fill="white" />
                                                <path fillRule="evenodd" clipRule="evenodd" d="M0 10.5H21V15.5H0V10.5Z" fill="black" />
                                                <path fillRule="evenodd" clipRule="evenodd" d="M0 0.5H21V5.5H0V0.5Z" fill="#007E35" />
                                                <path fillRule="evenodd" clipRule="evenodd" d="M0 0.5V15.5H6V0.5H0Z" fill="#FF0400" />
                                                <path d="M19 1H2C1.17157 1 0.5 1.67157 0.5 2.5V13.5C0.5 14.3284 1.17157 15 2 15H19C19.8284 15 20.5 14.3284 20.5 13.5V2.5C20.5 1.67157 19.8284 1 19 1Z" stroke="black" strokeOpacity="0.1" />
                                            </g>
                                        </g>
                                        <defs>
                                            <clipPath id="clip0_334_12559">
                                                <rect width="21" height="15" fill="white" transform="translate(0 0.5)" />
                                            </clipPath>
                                        </defs>
                                    </svg>
                                } />
                            </Box>
                            <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h6", sm: "h5" }, py: 3, color: "navbar.primary" }}>{props.formData.title}</Typography>
                            <Typography variant='subtitle1' sx={{ color: "assetPurchase.documentRedirectSecondaryText" }}>{props.formData.description}</Typography>
                            <Box sx={{ display: 'flex', gap: 1, my: 2, alignItems: 'center' }}>
                                <Typography style={{ fontWeight: 500 }} variant='subtitle1' sx={{ color: "navbar.primary" }}>Available fractions</Typography>
                                <Typography variant='subtitle2' sx={{ color: "assetPurchase.documentRedirectSecondaryText" }}>{props.formData.amountOfFractions} / {props.formData.amountOfFractions}</Typography>
                            </Box>
                            <Box sx={{
                                bgcolor: "assetPurchase.readSlider.primary",
                                border: '1px solid #64922F',
                                height: '33px',
                                borderTopLeftRadius: '20px',
                                borderBottomLeftRadius: '20px',
                                borderRadius: '20px',
                                borderRight: '1px solid #64922F',
                            }} />
                            <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "subtitle1", sm: "h6" }, color: "listingCard.buttonText", mt: 3 }}>Info</Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 3, borderBottom: 1, borderBottomColor: 'assetPurchase.documentRedirectBorder', pb: 0.5 }}>
                                <Typography variant='body1' sx={{ color: "marketplace.filterButtonText" }}>Amounts of Fractions</Typography>
                                <Typography variant='body1' sx={{ color: "navbar.primary", fontWeight: 500 }}>{props.formData.amountOfFractions}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2, borderBottom: 1, borderBottomColor: 'assetPurchase.documentRedirectBorder', pb: 0.5 }}>
                                <Typography variant='body1' sx={{ color: "marketplace.filterButtonText" }}>Property Value</Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography variant='subtitle1' sx={{ color: "navbar.primary", fontWeight: 500 }}>{props.formData.valuation * (currencies[props.user?.settings?.currency] || 1)}</Typography>
                                    <Typography variant='subtitle1' sx={{ color: "navbar.primary", fontWeight: 500, backgroundColor: "assetPurchase.currenciesDisplay", px: 1.5, borderRadius: "4px", width: "65px", textAlign: "center" }}>{props.user?.settings?.currency || "USD"}</Typography>
                                </Box>
                            </Box>
                        </Box>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: "center", mt: 5 }}>
                        <Button
                            disabled={isMiniting}
                            endIcon={isMiniting && <CircularProgress size={20} sx={{ color: "navbar.primary" }} />}
                            onClick={listNFT} variant="contained" sx={{ backgroundColor: "marketplace.viewMoreButtonBackground", borderRadius: 5, border: 1, borderColor: "marketplace.searchButtonBorder", py: 1, px: 3, height: "55px", width: { xs: "290px", sm: "344px", verticalTablet: "480px" } }}>
                            <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "subtitle1", horizontalTablet: "h6" }, color: "navbar.primary" }}>Publish Asset</Typography>
                        </Button>
                    </Box>
                </Box>
            }
        </Modal >
    )
}