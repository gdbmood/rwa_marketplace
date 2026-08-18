'use client'

import { useActiveAccount, useConnectedWallets, useConnectModal, useReadContract, useSendAndConfirmTransaction } from 'thirdweb/react';
import { Box, Button, Chip, Container, Divider, Typography, useMediaQuery, CircularProgress, Slider, Modal } from '@mui/material'
import { calculatePurchasePrice, Source } from '@/utils/calculatePurchasePrice';
import { client, contract, getContractByAddress } from '@/lib/thirdWebClient';
import TableCell, { tableCellClasses } from '@mui/material/TableCell';
import { defineChain, prepareContractCall, toUnits } from 'thirdweb';
import "react-responsive-carousel/lib/styles/carousel.min.css";
import { connectWalletConfig } from '@/utils/thirdwebConfig';
import CountdownModal from '@/components/countdown-modal';
import TableContainer from '@mui/material/TableContainer';
import { BusinessUser, RetailUser } from '@/types/Users';
import { buyNFT, fetchPlatformFee } from '@/utils/ABI';
import { useParams, useRouter } from 'next/navigation';
import purchaseSuccess from '@/utils/purchaseSuccess';
import { Carousel } from 'react-responsive-carousel';
import { getWalletBalance } from 'thirdweb/wallets';
import currencyStore from '@/store/currencyStore';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import { Asset as TAsset } from '@/types/Asset';
import TableRow from '@mui/material/TableRow';
import { styled } from '@mui/material/styles';
import { useState, useEffect } from 'react';
import assetStore from '@/store/assetStore';
import { Listing } from '@/types/Listing';
import { db } from '@/lib/firebaseClient';
import Footer from "@/components/footer";
import Navbar from '@/components/navbar';
import Table from '@mui/material/Table';
import nftStore from "@/store/nftStore";
import { NFT } from "@/types/NFT";
import Image from 'next/image';

interface detailedListing {
    listing: Listing;
    userName: string;
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

export default function Asset() {
    const router = useRouter()
    const params = useParams<{ saleId: string }>()

    const { data: platformFee } = useReadContract({ contract, method: fetchPlatformFee });
    const { connect, isConnecting } = useConnectModal();
    const connectedWallets = useConnectedWallets();
    const wallet = useActiveAccount();

    const { mutate: sendAndConfirmApproveTx, error: approveTxError, isPending: isApprovePending, isSuccess: isApproveSuccess, data: approveData } = useSendAndConfirmTransaction();
    const { mutate: sendAndConfirmTx, error: txError, isPending, isSuccess, data } = useSendAndConfirmTransaction();

    const isSm = useMediaQuery(theme => theme.breakpoints.down('sm'));
    const isBelow769 = useMediaQuery(theme => theme.breakpoints.down(769));

    const { nfts } = nftStore();
    const { assets, fetchAssets } = assetStore();
    const { currencies, fetchCurrencies } = currencyStore();

    const [nftOwnerUserProfile, setNftOwnerUserProfile] = useState<BusinessUser | null>(null);
    const [detailedListings, setDetailedListings] = useState<detailedListing[]>([]);
    const [userProfile, setUserProfile] = useState<RetailUser | null>(null);
    const [isPurchaseSuccess, setIsPurchaseSuccess] = useState(false);
    const [noOfFractionsToBuy, setNoOfFractionsToBuy] = useState(1);
    const [isKycRequired, setIsKycRequired] = useState(false);
    const [isKycVerified, setIsKycVerified] = useState(false);
    const [asset, setAsset] = useState<TAsset | null>(null);
    const [totalFractions, setTotalFractions] = useState(0);
    const [fractionsSold, setFractionsSold] = useState(0);
    const [sources, setSources] = useState<Source[]>([]);
    const [sliderValue, setSliderValue] = useState(1);
    const [nft, setNft] = useState<NFT | null>(null);
    const [totalPrice, setTotalPrice] = useState(0);
    const [error, setError] = useState<string>('');
    const [seconds, setSeconds] = useState(0);

    useEffect(() => {
        if (wallet) {
            db.collection('RetailUser').doc(wallet.address).get().then((doc) => {
                if (doc.exists) {
                    const userData = doc.data() as RetailUser;
                    if (userData) {
                        setUserProfile(userData);
                    }
                    else {
                        router.push('/')
                    }
                }
            })
            db.collection('RetailUser').doc(wallet.address).collection('KYCIdentity').where('sumsubVerified', '==', true).limit(1).get().then((querySnapshot) => {
                if (querySnapshot.docs.length > 0) {
                    setIsKycVerified(true);
                }
                else {
                    setIsKycVerified(false);
                }
            })
        }
    }, [wallet]);
    useEffect(() => {
        if (!assets.length) fetchAssets()
        if (!Object.keys(currencies).length) fetchCurrencies()
        db.collection('Asset').doc(params.saleId).collection('KYCRequirement').where('sumsubVerified', '==', true).limit(1).get().then((querySnapshot) => {
            if (querySnapshot.docs.length > 0) {
                setIsKycRequired(true);
            }
            else {
                setIsKycRequired(false);
            }
        });
    }, []);
    useEffect(() => {
        if (nfts.length && assets.length && Object.keys(currencies).length) {
            const asset = assets.filter(asset => asset._id === params.saleId);
            if (asset) {
                const nft = nfts.find(nft => nft.nftId === Number(asset[0]._id));
                if (nft) {
                    db.collection('Asset').doc(asset[0]._id).collection('Listing').get().then(async (querySnapshot) => {
                        const detailedListings: detailedListing[] = [];
                        await Promise.all(querySnapshot.docs.map(async (doc) => {
                            const data = doc.data() as Listing;
                            const tableName = nft.nftOwner === data.listerId ? 'BusinessUser' : 'RetailUser';
                            const [listingOwner] = await Promise.all([
                                db.collection(tableName).doc(data.listerId).get(),
                            ]);
                            if (listingOwner.exists) {
                                const userData = {
                                    _id: listingOwner.id,
                                    ...listingOwner.data()
                                } as RetailUser;
                                detailedListings.push({
                                    listing: { ...data, _id: doc.id } as Listing,
                                    userName: userData.name ?? userData._id
                                });
                            }
                        }));
                        detailedListings.sort((a, b) => {
                            if (a.listing.pricePerFraction < b.listing.pricePerFraction) return -1;
                            if (a.listing.pricePerFraction > b.listing.pricePerFraction) return 1;
                            return 0;
                        });

                        setTotalFractions(nft.totalSupply);
                        setFractionsSold(asset[0].initialSupply - asset[0].availableSupply);
                        setDetailedListings(detailedListings);
                        setAsset(asset[0])
                        setNft(nft)
                    });
                }
                else {
                    router.push('/marketplace')
                }
            }
            else {
                router.push('/marketplace')
            }
        }
    }, [assets, nfts, currencies])
    useEffect(() => {
        if (nft) {
            db.collection('BusinessUser').doc(nft.nftOwner).get().then((doc) => {
                if (doc.exists) {
                    const userData = doc.data() as BusinessUser;
                    if (userData) {
                        setNftOwnerUserProfile(userData);
                    }
                }
            })
        }
    }, [nft])

    useEffect(() => {
        if (!asset || !nft) return

        const { finalPrice, sources } = calculatePurchasePrice(asset, nft, detailedListings.map(listing => listing.listing), noOfFractionsToBuy);
        setSources(sources);
        setTotalPrice(finalPrice);
    }, [asset, nft, detailedListings, noOfFractionsToBuy])
    useEffect(() => {
        if (isApproveSuccess && nft) {
            const tx = prepareContractCall({
                contract,
                method: buyNFT,
                params: [BigInt(nft.nftId), BigInt(noOfFractionsToBuy)]
            });
            sendAndConfirmTx(tx)
        }
    }, [isApproveSuccess])
    useEffect(() => {
        if (isSuccess && data) {
            if (nft && asset && wallet && sources.length) {
                purchaseSuccess({ nft, wallet, asset, sources, totalPrice, platformFee: Number(platformFee), transactionHash: data.transactionHash, noOfFractionsToBuy, setError, setSeconds, setIsPurchaseSuccess });
            }
        }
    }, [isSuccess])
    useEffect(() => {
        if (error.trim() !== '') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, [error]);
    useEffect(() => {
        if (approveTxError) {
            setError(approveTxError.message);
        }
    }, [approveTxError])
    useEffect(() => {
        if (txError) {
            setError(txError.message);
        }
    }, [txError])

    const buyFraction = async () => {
        if (!wallet) {
            connect(connectWalletConfig());
            return
        }
        if (isKycRequired && !isKycVerified) {
            localStorage.setItem('redirectUrl', `/asset/${params.saleId}`);
            router.push('/verify')
            return
        }
        const smartWallet = connectedWallets.filter((wallet) => wallet.id === 'smart')[0]?.getAccount();
        if (!smartWallet) {
            console.error("Smart wallet not found");
            return;
        }
        if (totalFractions - fractionsSold < noOfFractionsToBuy) {
            setError("Not enough fractions available");
            return;
        }

        const balance = await getWalletBalance({
            chain: defineChain(parseInt(process.env.NEXT_PUBLIC_THIRDWEB_CHAIN_ID!)),
            address: smartWallet.address,
            client: client,
            tokenAddress: process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS!
        })
        const totalPriceIncludingFee = toUnits(String(totalPrice + (totalPrice * (Number(platformFee ?? 0) / 10000))), 6);
        if (balance.value >= totalPriceIncludingFee) {
            const tx = prepareContractCall({
                contract: getContractByAddress(process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS!),
                method: 'function approve(address to, uint256 amount) returns (bool)',
                params: [contract.address, totalPriceIncludingFee],
            })
            sendAndConfirmApproveTx(tx)
        }
        else {
            router.push(`/asset/${params.saleId}/buy/${noOfFractionsToBuy}`)
        }
    }

    return (
        <Box sx={{ backgroundColor: 'marketplace.background', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <Navbar />
            <Container sx={{ flexGrow: 1 }}>
                {!(nft && asset && nftOwnerUserProfile) ?
                    <Box sx={{ mt: 5, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        <CircularProgress sx={{ color: '#C6FF00' }} />
                    </Box>
                    :
                    <Box>
                        <Typography variant='h4' sx={{ display: { xs: "block", verticalTablet: "none" }, pt: 2, color: "navbar.primary", fontWeight: 500 }}>{nft?.metadata.nftName}</Typography>
                        {error && <Typography variant='subtitle2' sx={{ display: { xs: "block", verticalTablet: "none" }, color: 'red', pb: 1, overflow: 'auto' }}>{error}</Typography>}
                        <Box sx={{ mt: { xs: 2, sm: 7.5 }, display: 'flex', gap: 2.5, flexDirection: { xs: "column", verticalTablet: "row" } }}>
                            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, width: "100%" }}>
                                <Box sx={{
                                    flexGrow: 1,
                                    '& .carousel': {
                                        '& .thumb': {
                                            borderColor: '#424242'
                                        }
                                    }
                                }}>
                                    <Carousel showArrows={false} showStatus={false} showIndicators={false}
                                        swipeable={isSm ? false : true}
                                        preventMovementUntilSwipeScrollTolerance={true}
                                        swipeScrollTolerance={50}
                                        thumbWidth={isBelow769 ? 80 : 120}
                                        renderThumbs={() => {
                                            return nft?.metadata.imageUrls.map((i, index) => (
                                                <Image key={index} src={i} alt='' width={0} height={0} sizes='100vw' style={{ height: '80px', objectFit: 'cover' }} />
                                            )) || []
                                        }}
                                    >
                                        {nft?.metadata.imageUrls.map((i, index) => (
                                            <Image key={index} src={i} alt='' width={0} height={0} sizes='100vw' style={{ height: isSm ? '320px' : '474px', objectFit: 'cover' }} />
                                        ))}
                                    </Carousel>
                                </Box>
                                <Box onClick={() => { router.push(`/profile/${nft.nftOwner}`) }} sx={{ backgroundColor: "assetPurchase.documentRedirectBackground", border: 1, borderColor: "assetPurchase.documentRedirectBorder", borderRadius: 1, py: 1.5, px: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', gap: { xs: 1, sm: 0 } }}>
                                    <Box style={{ overflow: "hidden" }}>
                                        <Typography variant='subtitle1' sx={{ color: "navbar.primary", fontWeight: 500 }} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nftOwnerUserProfile?.legalName}</Typography>
                                        <Typography variant='subtitle2' sx={{ color: "assetPurchase.documentRedirectSecondaryText" }}>View issuer information</Typography>
                                    </Box>
                                    <Box sx={[
                                        {
                                            display: 'none'
                                        },
                                        (theme) => theme.applyStyles('dark', {
                                            display: "block"
                                        })
                                    ]}>
                                        <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path opacity="0.4" d="M22.5 2.5H7.5C4.73858 2.5 2.5 4.73858 2.5 7.5V22.5C2.5 24.8303 4.09415 26.7883 6.25138 27.3428C6.65049 27.4454 7.06887 27.5 7.5 27.5H22.5C22.9311 27.5 23.3495 27.4454 23.7486 27.3428C25.9059 26.7883 27.5 24.8303 27.5 22.5V7.5C27.5 4.73858 25.2614 2.5 22.5 2.5Z" fill="#FAFAFA" />
                                            <circle cx="3.75" cy="3.75" r="3.75" transform="matrix(1 0 0 -1 11.25 16.25)" fill="#FAFAFA" />
                                            <path d="M7.50057 27.5H22.5006C22.9317 27.5 23.3501 27.4454 23.7492 27.3428C23.6653 22.5829 19.7806 18.75 15.0006 18.75C10.2206 18.75 6.33579 22.5829 6.25195 27.3428C6.65106 27.4454 7.06944 27.5 7.50057 27.5Z" fill="#FAFAFA" />
                                        </svg>
                                    </Box>
                                    <Box sx={[
                                        {
                                            display: 'none'
                                        },
                                        (theme) => theme.applyStyles('light', {
                                            display: "block"
                                        })
                                    ]}>
                                        <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path opacity="0.4" d="M22.5 2.5H7.5C4.73858 2.5 2.5 4.73858 2.5 7.5V22.5C2.5 24.8303 4.09415 26.7883 6.25138 27.3428C6.65049 27.4454 7.06887 27.5 7.5 27.5H22.5C22.9311 27.5 23.3495 27.4454 23.7486 27.3428C25.9059 26.7883 27.5 24.8303 27.5 22.5V7.5C27.5 4.73858 25.2614 2.5 22.5 2.5Z" fill="#424242" />
                                            <circle cx="3.75" cy="3.75" r="3.75" transform="matrix(1 0 0 -1 11.25 16.25)" fill="#FAFAFA" />
                                            <path d="M7.50057 27.5H22.5006C22.9317 27.5 23.3501 27.4454 23.7492 27.3428C23.6653 22.5829 19.7806 18.75 15.0006 18.75C10.2206 18.75 6.33579 22.5829 6.25195 27.3428C6.65106 27.4454 7.06944 27.5 7.50057 27.5Z" fill="#FAFAFA" />
                                        </svg>
                                    </Box>
                                </Box>
                                <Box onClick={() => { router.push(`/asset/${params.saleId}/docs`) }} sx={{ backgroundColor: "assetPurchase.documentRedirectBackground", border: 1, borderColor: "assetPurchase.documentRedirectBorder", borderRadius: 1, py: 1.5, px: 2, display: Object.keys(nft.metadata.documentUrls).length ? 'flex' : 'none', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                                    <Box>
                                        <Typography variant='subtitle1' sx={{ color: "navbar.primary", fontWeight: 500 }}>Documents confirming ownership</Typography>
                                        <Typography variant='subtitle2' sx={{ color: "assetPurchase.documentRedirectSecondaryText" }}>Download and view documents</Typography>
                                    </Box>
                                    <Box sx={[
                                        {
                                            display: 'none'
                                        },
                                        (theme) => theme.applyStyles('dark', {
                                            display: "block"
                                        })
                                    ]}>
                                        <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path opacity="0.4" d="M27.5 21.25V12.5C27.5 9.73858 25.2614 7.5 22.5 7.5H19.1667C18.0848 7.5 17.0321 7.14911 16.1667 6.5L13.8333 4.75C12.9678 4.10089 11.9152 3.75 10.8333 3.75H7.5C4.73858 3.75 2.5 5.98858 2.5 8.75V21.25C2.5 24.0114 4.73858 26.25 7.5 26.25H22.5C25.2614 26.25 27.5 24.0114 27.5 21.25Z" fill="#FAFAFA" />
                                            <path fillRule="evenodd" clipRule="evenodd" d="M14.0625 17.7146C14.0042 17.6708 13.9482 17.6223 13.8951 17.5692L11.9129 15.587C11.5468 15.2209 10.9532 15.2209 10.5871 15.587C10.221 15.9531 10.221 16.5467 10.5871 16.9128L12.5693 18.895C13.9117 20.2375 16.0883 20.2375 17.4307 18.895L19.4129 16.9128C19.779 16.5467 19.779 15.9531 19.4129 15.587C19.0468 15.2209 18.4532 15.2209 18.0871 15.587L16.1049 17.5692C16.0518 17.6223 15.9958 17.6708 15.9375 17.7146V12.4999C15.9375 11.9821 15.5178 11.5624 15 11.5624C14.4822 11.5624 14.0625 11.9821 14.0625 12.4999V17.7146Z" fill="#FAFAFA" />
                                        </svg>
                                    </Box>
                                    <Box sx={[
                                        {
                                            display: 'none'
                                        },
                                        (theme) => theme.applyStyles('light', {
                                            display: "block"
                                        })
                                    ]}>
                                        <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path opacity="0.4" d="M27.5 21.25V12.5C27.5 9.73858 25.2614 7.5 22.5 7.5H19.1667C18.0848 7.5 17.0321 7.14911 16.1667 6.5L13.8333 4.75C12.9678 4.10089 11.9152 3.75 10.8333 3.75H7.5C4.73858 3.75 2.5 5.98858 2.5 8.75V21.25C2.5 24.0114 4.73858 26.25 7.5 26.25H22.5C25.2614 26.25 27.5 24.0114 27.5 21.25Z" fill="#424242" />
                                            <path fillRule="evenodd" clipRule="evenodd" d="M14.0625 17.7151C14.0042 17.6712 13.9482 17.6228 13.8951 17.5697L11.9129 15.5875C11.5468 15.2213 10.9532 15.2213 10.5871 15.5875C10.221 15.9536 10.221 16.5472 10.5871 16.9133L12.5693 18.8955C13.9117 20.2379 16.0883 20.238 17.4307 18.8955L19.4129 16.9133C19.779 16.5472 19.779 15.9536 19.4129 15.5875C19.0468 15.2213 18.4532 15.2213 18.0871 15.5875L16.1049 17.5697C16.0518 17.6228 15.9958 17.6712 15.9375 17.7151V12.5004C15.9375 11.9826 15.5178 11.5629 15 11.5629C14.4822 11.5629 14.0625 11.9826 14.0625 12.5004V17.7151Z" fill="#FAFAFA" />
                                        </svg>
                                    </Box>
                                </Box>
                            </Box>
                            <Box sx={{ flex: 1, width: "100%" }}>
                                <Box sx={{ display: 'flex', alignItems: "center", gap: 2, flexWrap: 'wrap' }}>
                                    <Chip sx={{ color: "marketplace.filterButtonText", border: 1, borderColor: "border", fontFamily: "Roboto", py: 1, px: 2.5 }} label={nftOwnerUserProfile?.legalName} />
                                    <Chip sx={{ color: "marketplace.filterButtonText", border: 1, borderColor: "border", fontFamily: "Roboto", py: 1, px: 2.5 }} label={nft.metadata.assetClass} />
                                    <Chip sx={{ border: 1, borderColor: "border", color: "marketplace.filterButtonText", p: 0.5 }} label={
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
                                <Typography variant='h5' sx={{ display: { xs: "none", verticalTablet: "block" }, pt: 3, pb: error.trim().length ? 0 : 3, color: "navbar.primary", fontWeight: 500 }}>{nft?.metadata.nftName}</Typography>
                                {error && <Typography variant='subtitle2' sx={{ display: { xs: "none", verticalTablet: "block" }, color: 'red', pb: 2 }}>{error}</Typography>}
                                <Typography variant='subtitle1' sx={{ color: "assetPurchase.documentRedirectSecondaryText", mt: { xs: 3, verticalTablet: 0 }, textAlign: 'justify' }}>{nft?.metadata.description}</Typography>
                                <Box sx={{ my: 3 }}>
                                    <Box sx={{ mt: 2, display: 'flex', gap: 2, flexDirection: { xs: "column", sm: "row" }, flexWrap: 'wrap' }}>
                                        <Box sx={{ backgroundColor: "assetPurchase.documentRedirectBackground", border: 1, borderColor: "assetPurchase.documentRedirectBorder", borderRadius: 1, py: 1.5, px: 2, flex: 1, flexBasis: "45%" }}>
                                            <Typography variant='subtitle1' sx={{ color: "navbar.primary", fontWeight: 500 }}>{totalFractions - fractionsSold}/{totalFractions}</Typography>
                                            <Typography variant='subtitle2' sx={{ color: "assetPurchase.documentRedirectSecondaryText" }}>Available Ownership Shares</Typography>
                                        </Box>
                                        {/* <Box sx={{ backgroundColor: "assetPurchase.documentRedirectBackground", border: 1, borderColor: "assetPurchase.documentRedirectBorder", borderRadius: 1, py: 1.5, px: 2, flex: 1, flexBasis: "45%" }}>
                                            <Typography variant='subtitle1' sx={{ color: "navbar.primary", fontWeight: 500 }}>${sale.amountSold * nft.pricePerFraction} / ${sale.amount * nft.pricePerFraction}</Typography>
                                            <Typography variant='subtitle2' sx={{ color: "assetPurchase.documentRedirectSecondaryText" }}>Fundraising Progress</Typography>
                                        </Box> */}
                                        {/* <Box sx={{ backgroundColor: "assetPurchase.documentRedirectBackground", border: 1, borderColor: "assetPurchase.documentRedirectBorder", borderRadius: 1, py: 1.5, px: 2, flex: 1, flexBasis: "45%" }}>
                                            <Typography variant='subtitle1' sx={{ color: "navbar.primary", fontWeight: 500 }}>{sale.noOfInvestors} Participants</Typography>
                                            <Typography variant='subtitle2' sx={{ color: "assetPurchase.documentRedirectSecondaryText" }}>Number of Investors</Typography>
                                        </Box> */}
                                        <Box sx={{ backgroundColor: "assetPurchase.documentRedirectBackground", border: 1, borderColor: "assetPurchase.documentRedirectBorder", borderRadius: 1, py: 1.5, px: 2, flex: 1, flexBasis: "45%" }}>
                                            <Typography variant='subtitle1' sx={{ color: "navbar.primary", fontWeight: 500 }}>Fiat, Stablecoins, Crypto</Typography>
                                            <Typography variant='subtitle2' sx={{ color: "assetPurchase.documentRedirectSecondaryText" }}>Accepted Payment Methods</Typography>
                                        </Box>
                                        <Box sx={{ backgroundColor: "assetPurchase.documentRedirectBackground", border: 1, borderColor: "assetPurchase.documentRedirectBorder", borderRadius: 1, py: 1.5, px: 2, flex: 1, flexBasis: "45%" }}>
                                            <Typography variant='subtitle1' sx={{ color: "navbar.primary", fontWeight: 500 }}>${detailedListings.length && detailedListings[0].listing.pricePerFraction < nft.pricePerFraction ? detailedListings[0].listing.pricePerFraction : nft.pricePerFraction} per share</Typography>
                                            <Typography variant='subtitle2' sx={{ color: "assetPurchase.documentRedirectSecondaryText" }}>Minimum Investment Amount</Typography>
                                        </Box>
                                    </Box>
                                </Box>
                            </Box>
                        </Box>
                        <Box sx={{ mt: 7, color: "navbar.primary", display: detailedListings.length ? "block" : "none" }}>
                            <Typography variant='h5' sx={{ fontWeight: 500 }}>Listings</Typography>
                            <TableContainer sx={{ mt: 3.5 }}>
                                <Table>
                                    <TableHead>
                                        <TableRow>
                                            <StyledTableCell>From</StyledTableCell>
                                            <StyledTableCell>Quantity Available</StyledTableCell>
                                            <StyledTableCell>Price</StyledTableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {detailedListings.map((row, index) => (
                                            <StyledTableRow key={index}>
                                                <StyledTableCell>{row.userName}</StyledTableCell>
                                                <StyledTableCell>{row.listing.quantity}</StyledTableCell>
                                                <StyledTableCell>{row.listing.pricePerFraction}</StyledTableCell>
                                            </StyledTableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Box>
                        {isKycRequired && <Box sx={{ mt: 7, color: "navbar.primary" }}>
                            <Typography variant='h5' sx={{ fontWeight: 500 }}>Eligibility criteria</Typography>
                            <Box sx={{ bgcolor: "assetPurchase.documentRedirectBackground", display: "flex", p: 2, mt: 2.5, border: 1, borderColor: "border" }}>
                                <Typography variant='subtitle2' sx={{ fontFamily: "Roboto", fontWeight: 500, flex: 1 }}>Criteria</Typography>
                                <Typography variant='subtitle2' sx={{ fontFamily: "Roboto", fontWeight: 500 }}>Status</Typography>
                            </Box>
                            <Box sx={{ display: "flex", p: 2, border: 1, borderColor: "border" }}>
                                <Typography variant='subtitle2' sx={{ flex: 1 }}>KYC Completed</Typography>
                                <Typography variant='subtitle2'>
                                    {
                                        isKycVerified ?
                                            <svg width="24" height="25" viewBox="0 0 24 25" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path fillRule="evenodd" clipRule="evenodd" d="M18 2.32129H6C3.79086 2.32129 2 4.11215 2 6.32129V18.3213C2 20.5304 3.79086 22.3213 6 22.3213H18C20.2091 22.3213 22 20.5304 22 18.3213V6.32129C22 4.11215 20.2091 2.32129 18 2.32129ZM16.592 9.78178C16.8463 9.45482 16.7874 8.98361 16.4605 8.72931C16.1335 8.47501 15.6623 8.53391 15.408 8.86087L11.401 14.0127C11.3119 14.1273 11.1443 14.1422 11.0364 14.0451L8.50173 11.7639C8.19385 11.4868 7.71963 11.5117 7.44254 11.8196C7.16544 12.1275 7.1904 12.6017 7.49828 12.8788L10.033 15.16C10.7881 15.8396 11.9613 15.7356 12.585 14.9336L16.592 9.78178Z" fill="#C6FF00" />
                                            </svg>
                                            :
                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="25" fill="currentColor" viewBox="0 0 16 16">
                                                <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0M5.354 4.646a.5.5 0 1 0-.708.708L7.293 8l-2.647 2.646a.5.5 0 0 0 .708.708L8 8.707l2.646 2.647a.5.5 0 0 0 .708-.708L8.707 8l2.647-2.646a.5.5 0 0 0-.708-.708L8 7.293z" style={{ color: '#FF0000' }} />
                                            </svg>}
                                </Typography>
                            </Box>
                        </Box>}
                        <Box sx={{ display: 'flex', gap: 4, mt: 7, flexDirection: { xs: "column", verticalTablet: "row" } }}>
                            <Box sx={{ flex: 1, width: "100%" }}>
                                <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "subtitle1", sm: "h6" }, color: "navbar.primary" }}>How many fractions of this asset do you want to buy?</Typography>
                                <Box sx={{ display: 'flex', my: 3 }}>
                                    {
                                        totalFractions - fractionsSold !== 0 &&
                                        <Box sx={{
                                            flex: (totalFractions - fractionsSold) / totalFractions,
                                            bgcolor: "assetPurchase.readSlider.primary",
                                            border: '1px solid #64922F',
                                            height: '28px',
                                            borderTopLeftRadius: '20px',
                                            borderBottomLeftRadius: '20px',
                                            borderRadius: fractionsSold !== 0 ? '' : '20px',
                                            borderRight: fractionsSold !== 0 ? 'none' : '1px solid #64922F',
                                            position: 'relative',
                                        }}>
                                            <Slider
                                                value={sliderValue}
                                                onChange={(e, value) => {
                                                    if (value === 0) {
                                                        setNoOfFractionsToBuy(1)
                                                        setSliderValue(1)
                                                    }
                                                    else {
                                                        setSliderValue(Number(value))
                                                        setNoOfFractionsToBuy(Number(value))
                                                    }
                                                }}
                                                valueLabelDisplay="on"
                                                shiftStep={1}
                                                step={1}
                                                sx={{
                                                    height: "26px",
                                                    position: 'absolute',
                                                    left: -1,
                                                    color: "transparent",
                                                    '&.MuiSlider-colorPrimary': { padding: 0 },
                                                    '& .MuiSlider-track': {
                                                        backgroundColor: "#191d20",
                                                        border: "1px solid #42A5F5",
                                                        borderTopLeftRadius: '20px',
                                                        borderBottomLeftRadius: '20px',
                                                        borderTopRightRadius: 0,
                                                        borderBottomRightRadius: 0
                                                    },
                                                    '& .MuiSlider-thumb': {
                                                        width: '0px',
                                                        height: '0px',
                                                        backgroundColor: "transparent",
                                                        border: 'none',

                                                        '&:after': {
                                                            content: '""',
                                                            width: '3px',
                                                            height: '28px',
                                                            borderRadius: 0,
                                                            backgroundColor: "assetPurchase.slider",
                                                        },
                                                    },
                                                }}
                                                min={0}
                                                max={totalFractions - fractionsSold}
                                            />
                                        </Box>
                                    }
                                    {
                                        fractionsSold !== 0 &&
                                        <Box sx={{
                                            flex: fractionsSold / totalFractions,
                                            bgcolor: "assetPurchase.readSlider.secondary",
                                            border: '1px solid #FF8A65',
                                            height: '28px',
                                            borderTopRightRadius: '20px',
                                            borderBottomRightRadius: '20px',
                                            borderRadius: totalFractions - fractionsSold !== 0 ? '' : '20px',
                                        }} />
                                    }
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1, cursor: 'pointer', flexWrap: 'wrap' }}>
                                    {['1', '2', '5', '10', 'All'].map((i) => (
                                        <Box onClick={() => {
                                            setNoOfFractionsToBuy(i === 'All' ? (totalFractions - fractionsSold) : (totalFractions - fractionsSold) > Number(i) ? Number(i) : (totalFractions - fractionsSold))
                                            setSliderValue(i === 'All' ? (totalFractions - fractionsSold) : (totalFractions - fractionsSold) > Number(i) ? Number(i) : (totalFractions - fractionsSold))
                                        }}
                                            key={i} sx={{ backgroundColor: "listingCard.background", py: 1.5, px: 3, borderRadius: 1, flexGrow: 1 }}>
                                            <Typography variant='subtitle1' sx={{ color: "navbar.primary", fontWeight: 500, textAlign: "center" }}>{i}</Typography>
                                        </Box>
                                    ))}
                                </Box>
                                <Box sx={{ my: 4 }}>
                                    <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "subtitle1", sm: "h6" }, color: "navbar.primary" }}>Or specify the exact amount and currency</Typography>
                                    <Box sx={{ backgroundColor: "listingCard.background", px: 3, py: 1.5, mt: 2, display: "flex", justifyContent: "space-between" }}>
                                        <Typography variant='subtitle1' sx={{ color: "navbar.primary", fontWeight: 500 }}>Amount</Typography>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5 }}>
                                            <Box sx={[
                                                {
                                                    display: 'none'
                                                },
                                                (theme) => theme.applyStyles('dark', {
                                                    display: "block"
                                                })
                                            ]}>
                                                <svg onClick={() => {
                                                    if (noOfFractionsToBuy > 1) {
                                                        setNoOfFractionsToBuy(noOfFractionsToBuy - 1)
                                                        setSliderValue(noOfFractionsToBuy - 1)
                                                    }
                                                }} style={{ cursor: "pointer" }} width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                    <rect width="24" height="24" rx="4" fill="white" fillOpacity="0.12" />
                                                    <path d="M18 12L6 12" stroke="#FAFAFA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            </Box>
                                            <Box sx={[
                                                {
                                                    display: 'none'
                                                },
                                                (theme) => theme.applyStyles('light', {
                                                    display: "block"
                                                })
                                            ]}>
                                                <svg onClick={() => {
                                                    if (noOfFractionsToBuy > 1) {
                                                        setNoOfFractionsToBuy(noOfFractionsToBuy - 1)
                                                        setSliderValue(noOfFractionsToBuy - 1)
                                                    }
                                                }} style={{ cursor: "pointer" }} width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                    <rect width="24" height="24" rx="4" fill="#757575" />
                                                    <path d="M18 12L6 12" stroke="#FAFAFA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            </Box>
                                            <Typography variant='subtitle1' sx={{ color: "navbar.primary", fontWeight: 500 }}>{noOfFractionsToBuy}</Typography>
                                            <Box sx={[
                                                {
                                                    display: 'none'
                                                },
                                                (theme) => theme.applyStyles('dark', {
                                                    display: "block"
                                                })
                                            ]}>
                                                <svg onClick={() => {
                                                    if (noOfFractionsToBuy < totalFractions - fractionsSold) {
                                                        setNoOfFractionsToBuy(noOfFractionsToBuy + 1)
                                                        setSliderValue(noOfFractionsToBuy + 1)
                                                    }
                                                }} style={{ cursor: "pointer" }} width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                    <rect width="24" height="24" rx="4" fill="white" fillOpacity="0.12" />
                                                    <path d="M12 6V18M18 12L6 12" stroke="#FAFAFA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            </Box>
                                            <Box sx={[
                                                {
                                                    display: 'none'
                                                },
                                                (theme) => theme.applyStyles('light', {
                                                    display: "block"
                                                })
                                            ]}>
                                                <svg onClick={() => {
                                                    if (noOfFractionsToBuy < totalFractions - fractionsSold) {
                                                        setNoOfFractionsToBuy(noOfFractionsToBuy + 1)
                                                        setSliderValue(noOfFractionsToBuy + 1)
                                                    }
                                                }} style={{ cursor: "pointer" }} width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                    <rect width="24" height="24" rx="4" fill="#757575" />
                                                    <path d="M12 6V18M18 12L6 12" stroke="#FAFAFA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            </Box>
                                        </Box>
                                    </Box>
                                </Box>
                                <Box sx={{ my: { xs: 3.5, sm: 6 } }}>
                                    <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "subtitle1", sm: "h6" }, color: "navbar.primary" }}>Subtotal</Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 3, borderBottom: 1, borderBottomColor: 'assetPurchase.documentRedirectBorder', pb: 0.5 }}>
                                        <Typography variant='body1' sx={{ color: "marketplace.filterButtonText" }}>Total number of fractions</Typography>
                                        <Typography variant='body1' sx={{ color: "navbar.primary", fontWeight: 500 }}>{noOfFractionsToBuy}</Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2, borderBottom: 1, borderBottomColor: 'assetPurchase.documentRedirectBorder', pb: 0.5 }}>
                                        <Typography variant='body1' sx={{ color: "marketplace.filterButtonText" }}>Total in fiat</Typography>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Typography variant='subtitle1' sx={{ color: "navbar.primary", fontWeight: 500 }}>{totalPrice * (userProfile?.settings ? currencies[userProfile?.settings.currency] : 1)}</Typography>
                                            <Typography variant='subtitle1' sx={{ color: "navbar.primary", fontWeight: 500, backgroundColor: "assetPurchase.currenciesDisplay", px: 1.5, borderRadius: "4px", width: "65px", textAlign: "center" }}>{userProfile?.settings?.currency || "USD"}</Typography>
                                        </Box>
                                    </Box>
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2, borderBottom: 1, borderBottomColor: 'assetPurchase.documentRedirectBorder', pb: 0.5 }}>
                                        <Typography variant='body1' sx={{ color: "marketplace.filterButtonText" }}>Total in crypto</Typography>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Typography variant='subtitle1' sx={{ color: "navbar.primary", fontWeight: 500 }}>{totalPrice}</Typography>
                                            <Typography variant='subtitle1' sx={{ color: "navbar.primary", fontWeight: 500, backgroundColor: "assetPurchase.currenciesDisplay", px: 1.5, borderRadius: "4px", width: "65px", textAlign: "center" }}>USDC</Typography>
                                        </Box>
                                    </Box>
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2, borderBottom: 1, borderBottomColor: 'assetPurchase.documentRedirectBorder', pb: 0.5 }}>
                                        <Typography variant='body1' sx={{ color: "marketplace.filterButtonText" }}>Fee</Typography>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Typography variant='subtitle1' sx={{ color: "navbar.primary", fontWeight: 500 }}>{platformFee && (Math.round((totalPrice * (Number(platformFee) / 10000)) * 1e6) / 1e6)}</Typography>
                                            <Typography variant='subtitle1' sx={{ color: "navbar.primary", fontWeight: 500, backgroundColor: "assetPurchase.currenciesDisplay", px: 1.5, borderRadius: "4px", width: "65px", textAlign: "center" }}>USDC</Typography>
                                        </Box>
                                    </Box>
                                </Box>
                            </Box>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: "center", mt: 4, gap: 2.5 }}>
                            <Box sx={{ cursor: 'pointer', backgroundColor: "marketplace.viewMoreButtonBackground", color: "navbar.primary", borderRadius: 5, py: 1, px: 2.5, width: isSm ? "100%" : asset.minterId === wallet?.address ? "214px" : "177px", border: 1, borderColor: "border", textAlign: "center" }} onClick={buyFraction}>
                                {asset.minterId === wallet?.address ? "Buy your fractions" : "BUY"}
                            </Box>
                            {asset.minterId === wallet?.address && <Button disableElevation variant="contained" sx={{ backgroundColor: "marketplace.viewMoreButtonBackground", color: "navbar.primary", border: 1, borderColor: "border", borderRadius: 5, py: 1, px: 2.5, width: { xs: "100%", sm: "214px" } }} onClick={() => { router.push(`/asset/${params.saleId}/update`) }}>Update asset data</Button>}
                        </Box>
                    </Box>}
            </Container >
            <Divider sx={{ backgroundColor: '#343434', mt: 9 }} />
            <Footer />

            <CountdownModal seconds={seconds} setSeconds={setSeconds} error={error} isPending={isPending || isApprovePending} />
            <Modal
                open={isPurchaseSuccess}
                onClose={() => { setIsPurchaseSuccess(false) }}
                aria-labelledby="modal-modal-title"
                aria-describedby="modal-modal-description"
            >
                <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', bgcolor: 'marketplace.background', px: { xs: 3.5, sm: 5, verticalTablet: 12 }, py: 10, width: { xs: "100%", sm: "90%", horizontalTablet: "65%" }, overflowY: 'auto', height: 'auto', display: "flex", alignItems: "center", flexDirection: "column" }}>
                    <Image src="/webp/party-popper.webp" width={100} height={100} alt="confirm" />
                    <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h6", sm: "h4" }, color: "navbar.primary", my: { xs: 3, sm: 5 } }}>Fractions bought successfully</Typography>
                    <Button onClick={() => { router.push('/portfolio'); }} variant="contained" sx={{ backgroundColor: "marketplace.viewMoreButtonBackground", borderRadius: 5, border: 1, borderColor: "marketplace.searchButtonBorder", py: 1, px: 3, height: "55px", width: { xs: "290px", sm: "344px", verticalTablet: "480px" } }}>
                        <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "subtitle1", horizontalTablet: "h6" }, color: "navbar.primary" }}>Go to portfolio</Typography>
                    </Button>
                </Box>
            </Modal>
        </Box >
    )
}