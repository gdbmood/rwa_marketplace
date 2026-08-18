"use client";

import { useActiveAccount, useSendAndConfirmTransaction, useReadContract, useConnectModal, useConnectedWallets, useSetActiveWallet, PayEmbed } from 'thirdweb/react';
import { Bridge, defineChain, prepareContractCall, prepareTransaction, sendAndConfirmTransaction, toUnits, waitForReceipt } from "thirdweb";
import { Box, Button, Typography, Modal, CircularProgress, Container, Divider } from '@mui/material'
import { calculatePurchasePrice, Source } from '@/utils/calculatePurchasePrice';
import { client, contract, getContractByAddress } from '@/lib/thirdWebClient';
import { connectWalletConfig } from '@/utils/thirdwebConfig';
import CountdownModal from '@/components/countdown-modal';
import { buyNFT, fetchPlatformFee } from '@/utils/ABI';
import { useParams, useRouter } from 'next/navigation';
import purchaseSuccess from '@/utils/purchaseSuccess';
import { getWalletBalance } from 'thirdweb/wallets';
import currencyStore from '@/store/currencyStore';
import { Asset as TAsset } from '@/types/Asset';
import { useEffect, useState } from 'react';
import assetStore from '@/store/assetStore';
import { RetailUser } from '@/types/Users';
import { Listing } from '@/types/Listing';
import { db } from '@/lib/firebaseClient';
import Navbar from '@/components/navbar';
import Footer from '@/components/footer';
import nftStore from '@/store/nftStore';
import { NFT } from '@/types/NFT';
import Image from 'next/image'

interface Currency {
    address: string;
    symbol: string;
}

export default function PurchasePage() {
    const router = useRouter();
    const params = useParams<{ saleId: string, noOfFractionsToBuy: string }>()

    const { mutate: sendAndConfirmTx, error: txError, isPending, isSuccess, data } = useSendAndConfirmTransaction();
    const { data: platformFee } = useReadContract({ contract, method: fetchPlatformFee });

    const wallet = useActiveAccount();
    const setActiveWallet = useSetActiveWallet();
    const connectedWallets = useConnectedWallets();

    const { connect, isConnecting } = useConnectModal();

    const { nfts } = nftStore();
    const { assets, fetchAssets } = assetStore();
    const { currencies, fetchCurrencies } = currencyStore();

    const [error, setError] = useState('');
    const [seconds, setSeconds] = useState(0);
    const [totalPrice, setTotalPrice] = useState(0);
    const [nft, setNft] = useState<NFT | null>(null);
    const [balance, setBalance] = useState<any>(null);
    const [fundWallet, setFundWallet] = useState(false);
    const [sources, setSources] = useState<Source[]>([]);
    const [fractionsSold, setFractionsSold] = useState(0);
    const [totalFractions, setTotalFractions] = useState(0);
    const [asset, setAsset] = useState<TAsset | null>(null);
    const [listings, setListings] = useState<Listing[]>([]);
    const [isApprovePending, setIsApprovePending] = useState(false);
    const [isPurchaseSuccess, setIsPurchaseSuccess] = useState(false);
    const [userProfile, setUserProfile] = useState<RetailUser | null>(null);
    const [selectedCurrency, setSelectedCurrency] = useState<Currency>({ address: process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS!, symbol: "USDC" });
    const [supportedCurrencies, setSupportedCurrencies] = useState<Currency[]>([{ address: process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS!, symbol: "USDC" }]);

    async function handleConnect() {
        await connect(connectWalletConfig())
    }

    useEffect(() => {
        if (!assets.length) fetchAssets()
        if (!Object.keys(currencies).length) fetchCurrencies()
        Bridge.routes({
            originChainId: parseInt(process.env.NEXT_PUBLIC_THIRDWEB_CHAIN_ID!),
            destinationChainId: parseInt(process.env.NEXT_PUBLIC_THIRDWEB_CHAIN_ID!),
            destinationTokenAddress: process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS!,
            client: client,
        }).then((routes) => {
            const mappedRoutes = routes.map((route) => ({
                address: route.originToken.address,
                symbol: route.originToken.symbol
            }));
            mappedRoutes.unshift({
                address: process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS!,
                symbol: "USDC"
            });
            setSupportedCurrencies(mappedRoutes);
        })
    }, []);
    useEffect(() => {
        const smartWallet = connectedWallets.filter((wallet) => wallet.id === 'smart')[0]?.getAccount();
        if (!smartWallet) return;

        getWalletBalance({
            chain: defineChain(parseInt(process.env.NEXT_PUBLIC_THIRDWEB_CHAIN_ID!)),
            address: smartWallet.address,
            client: client,
            tokenAddress: selectedCurrency.address || process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS!
        }).then((tokenBalance) => { setBalance(tokenBalance) })
    }, [connectedWallets, selectedCurrency])
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
        }
    }, [wallet]);
    useEffect(() => {
        if (assets.length && Object.keys(currencies).length) {
            const asset = assets.filter(asset => asset._id === params.saleId);
            if (asset) {
                const nft = nfts.find(nft => nft.nftId === Number(asset[0]._id));
                if (nft) {
                    db.collection('Asset').doc(asset[0]._id).collection('Listing').get().then((querySnapshot) => {
                        const listings: Listing[] = [];
                        querySnapshot.forEach((doc) => {
                            listings.push({
                                ...doc.data() as Listing,
                                _id: doc.id
                            })
                        });

                        setTotalFractions(nft.totalSupply);
                        setFractionsSold(asset[0].initialSupply - (asset[0].availableSupply || 0));
                        setListings(listings);
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
        if (!asset || !nft) return

        const { finalPrice, sources: calculatedSources } = calculatePurchasePrice(asset, nft, listings, Number(params.noOfFractionsToBuy));
        setSources(calculatedSources);
        setTotalPrice(finalPrice);
    }, [asset, nft, listings])

    useEffect(() => {
        if (isSuccess) {
            if (nft && asset && wallet && sources.length) {
                purchaseSuccess({ nft, wallet, asset, sources, totalPrice, platformFee: Number(platformFee), transactionHash: data.transactionHash, noOfFractionsToBuy: Number(params.noOfFractionsToBuy), setError, setSeconds, setIsPurchaseSuccess }).then(() => {
                    setTimeout(() => {
                        router.push('/asset/' + params.saleId);
                    }, 2500);
                })
            }
        }
    }, [isSuccess]);
    useEffect(() => {
        if (error.trim() !== '') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, [error]);
    useEffect(() => {
        if (txError) {
            setError(txError.message);
        }
    }, [txError]);

    const buyFractions = async () => {
        if (!asset) { router.push('/marketplace'); return; }
        if (!nft) { router.push('/marketplace'); return; }
        if (!wallet) { alert('Please connect your wallet'); return; }
        setError('');

        if (Number(params.noOfFractionsToBuy) < 1) { setError('Minimum amount is 1'); return; }
        if (Number(params.noOfFractionsToBuy) > totalFractions - fractionsSold) { setError(`Max amount is ${totalFractions - fractionsSold}`); return; }

        const platformFeeAmount = totalPrice * (Number(platformFee) / 10000);
        const totalAmount = (totalPrice + platformFeeAmount) * 10 ** 6;

        setIsApprovePending(true);
        if (selectedCurrency.address !== process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS!) {
            const buyQuote = await Bridge.Buy.quote({
                originChainId: parseInt(process.env.NEXT_PUBLIC_THIRDWEB_CHAIN_ID!),
                originTokenAddress: selectedCurrency.address,
                destinationChainId: parseInt(process.env.NEXT_PUBLIC_THIRDWEB_CHAIN_ID!),
                destinationTokenAddress: process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS!,
                buyAmountWei: BigInt(Math.round(totalAmount) + 1),
                client
            });

            if (Number(balance.value) < buyQuote.originAmount) {
                setError('Insufficient balance');
                return
            }
            else {
                try {
                    const preparedQuote = await Bridge.Buy.prepare({
                        originChainId: parseInt(process.env.NEXT_PUBLIC_THIRDWEB_CHAIN_ID!),
                        originTokenAddress: selectedCurrency.address,
                        destinationChainId: parseInt(process.env.NEXT_PUBLIC_THIRDWEB_CHAIN_ID!),
                        destinationTokenAddress: process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS!,
                        amount: BigInt(Math.round(totalAmount) + 1),
                        sender: wallet.address,
                        receiver: wallet.address,
                        client
                    });
                    for (const step of preparedQuote.steps) {
                        for (const transaction of step.transactions) {
                            const result = await sendAndConfirmTransaction({
                                transaction,
                                account: wallet,
                            });

                            // Wait for cross-chain completion if needed
                            if (
                                ["buy", "sell", "transfer"].includes(transaction.action)
                            ) {
                                let swapStatus;
                                do {
                                    swapStatus = await Bridge.status({
                                        transactionHash: result.transactionHash,
                                        chainId: transaction.chainId,
                                        client,
                                    });
                                    if (swapStatus.status === "PENDING") {
                                        await new Promise((resolve) =>
                                            setTimeout(resolve, 3000),
                                        );
                                    }
                                } while (swapStatus.status === "PENDING");
                            }
                        }
                    }
                } catch (error) {
                    setError('Transaction failed');
                    console.error('Error during transaction:', error);
                    return;
                }
            }
        }
        setFundWallet(true);
    }

    return (
        <>
            <Box sx={{ backgroundColor: 'marketplace.background', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
                <Navbar />
                <Container sx={{ flexGrow: 1 }}>
                    {!(nft) ?
                        <Box sx={{ mt: 5, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                            <CircularProgress sx={{ color: '#C6FF00' }} />
                        </Box>
                        :
                        <>
                            <Box sx={{ flexGrow: { xs: 1, sm: 0 }, mt: 8 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 2 }, flexDirection: { xs: "column", sm: "row" } }}>
                                    <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "subtitle1", sm: "h5" }, color: "assetPurchase.modal.heading" }}>BUY ASSET</Typography>
                                    <Box sx={{ display: { xs: "none", sm: "block" } }} >
                                        <svg width="1" height="20" viewBox="0 0 1 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <line x1="0.5" y1="0.571289" x2="0.499999" y2="19.5713" stroke="#9E9E9E" />
                                        </svg>
                                    </Box>
                                    <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "subtitle1", sm: "h5" }, color: "assetPurchase.modal.heading" }}>{nft.metadata.nftName}</Typography>
                                </Box>
                                {error && <Typography variant='subtitle2' sx={{ color: 'red' }}>{error}</Typography>}
                            </Box>
                            <Box sx={{ display: 'flex', gap: 4, flexDirection: { xs: "column", verticalTablet: "row" }, mt: { xs: 1, verticalTablet: 0 } }}>
                                <Box sx={{ flex: 1, width: "100%" }}>
                                    <Image src={nft.metadata.imageUrls[0] || ""} alt='' width={0} height={0} sizes="100vw" style={{ width: '100%', height: '100%', maxHeight: "469px", borderRadius: 5, objectFit: 'contain' }} />
                                </Box>
                                <Box sx={{ flex: 1, width: "100%" }}>
                                    <Box sx={{ my: { xs: 3.5, sm: 6 } }}>
                                        <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "subtitle1", sm: "h6" }, color: "listingCard.buttonText" }}>Subtotal</Typography>
                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 3, borderBottom: 1, borderBottomColor: 'assetPurchase.documentRedirectBorder', pb: 0.5 }}>
                                            <Typography variant='body1' sx={{ color: "marketplace.filterButtonText" }}>Total number of fractions</Typography>
                                            <Typography variant='body1' sx={{ color: "navbar.primary", fontWeight: 500 }}>{Number(params.noOfFractionsToBuy)}</Typography>
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
                                                <Typography variant='subtitle1' sx={{ color: "navbar.primary", fontWeight: 500 }}>{platformFee && (Math.round(totalPrice * (Number(platformFee) / 10000) * 1e6) / 1e6)}</Typography>
                                                <Typography variant='subtitle1' sx={{ color: "navbar.primary", fontWeight: 500, backgroundColor: "assetPurchase.currenciesDisplay", px: 1.5, borderRadius: "4px", width: "65px", textAlign: "center" }}>USDC</Typography>
                                            </Box>
                                        </Box>
                                    </Box>
                                    {/* <Box sx={{ mt: 6 }}>
                                        <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "subtitle1", sm: "h6" }, color: "navbar.primary" }}>Choose a payment currency</Typography>
                                        <Select
                                            value={selectedCurrency.address}
                                            onChange={(e) => {
                                                const selected = supportedCurrencies.find((currency) => currency.address === e.target.value);
                                                if (selected) {
                                                    setSelectedCurrency({
                                                        address: selected.address,
                                                        symbol: selected.symbol
                                                    });
                                                }
                                            }}
                                            sx={{
                                                mt: 3,
                                                backgroundColor: "marketplace.filterMenuBackground",
                                                border: 1,
                                                borderColor: "assetPurchase.documentRedirectBorder",
                                                borderRadius: 1,
                                                width: "100%",
                                                height: "56px",
                                            }}
                                        >
                                            {supportedCurrencies.map((currency) => (
                                                <MenuItem key={currency.address} value={currency.address}>
                                                    {currency.symbol}
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </Box> */}
                                    <Box sx={{ mt: 6 }}>
                                        <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "subtitle1", sm: "h6" }, color: "navbar.primary" }}>Choose a payment method</Typography>
                                        {
                                            connectedWallets.filter((wallet) => wallet.id === 'smart').length > 0 &&
                                            <Box onClick={() => {
                                                if (isPending || isApprovePending) return

                                                setActiveWallet(connectedWallets.filter((wallet) => wallet.id === 'smart')[0])
                                                buyFractions()
                                            }} sx={{ cursor: !(isPending || isApprovePending) ? "pointer" : "" }} mt={3} p={1.5} bgcolor={"marketplace.filterMenuBackground"} display={'flex'} alignItems={'center'} justifyContent={'space-between'} border={1} borderColor={"assetPurchase.documentRedirectBorder"} borderRadius={1}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                                    <svg width="24" height="25" viewBox="0 0 24 25" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                        <path fillRule="evenodd" clipRule="evenodd" d="M22 7.64258C22 5.43344 20.2091 3.64258 18 3.64258H6C3.79086 3.64258 2 5.43344 2 7.64258V9.14258H6C7.933 9.14258 9.5 10.7096 9.5 12.6426C9.5 14.5756 7.933 16.1426 6 16.1426H2V17.6426C2 19.8517 3.79086 21.6426 6 21.6426H13C13.5523 21.6426 14 21.1949 14 20.6426V19.6426C14 17.4334 15.7909 15.6426 18 15.6426H21C21.5523 15.6426 22 15.1949 22 14.6426V7.64258ZM8 12.6426C8 11.538 7.10457 10.6426 6 10.6426H2V14.6426H6C7.10457 14.6426 8 13.7471 8 12.6426ZM22.4939 17.0781C22.8056 17.3509 22.8372 17.8247 22.5644 18.1365L19.6945 21.4163C19.0778 22.1211 18.0156 22.2155 17.2843 21.6305L15.5315 20.2282C15.208 19.9695 15.1556 19.4975 15.4143 19.1741C15.6731 18.8506 16.1451 18.7982 16.4685 19.0569L18.2213 20.4592C18.3258 20.5428 18.4776 20.5293 18.5657 20.4286L21.4356 17.1487C21.7083 16.837 22.1822 16.8054 22.4939 17.0781Z" fill="#BDBDBD" />
                                                    </svg>
                                                    <Box>
                                                        <Typography variant={'subtitle1'} sx={{ color: "navbar.primary", fontWeight: 500 }}>Buy using embedded wallet</Typography>
                                                        <Typography variant={'subtitle2'} sx={{ color: "marketplace.filterButtonText" }}>
                                                            ${Number(balance?.displayValue) || 0} available on your wallet
                                                        </Typography>
                                                    </Box>
                                                </Box>
                                                {/* {
                                                    wallet && wallet.address === connectedWallets.filter((wallet) => wallet.id === 'inApp')[0]?.getAccount()?.address &&
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 16 16" style={{ color: "#FAFAFA" }}>
                                                        <path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l3.052 3.093 5.4-6.425z" />
                                                    </svg>
                                                } */}
                                                {((isPending || isApprovePending) && error.trim() === "") && <CircularProgress size={20} sx={{ color: "navbar.primary" }} />}
                                            </Box>
                                        }
                                        {/* <Box onClick={handleConnect} sx={{ cursor: "pointer" }} mt={3} p={1.5} bgcolor={"marketplace.filterMenuBackground"} display={'flex'} alignItems={'center'} justifyContent={'space-between'} border={1} borderColor={"assetPurchase.documentRedirectBorder"} borderRadius={1}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                        <svg width="24" height="25" viewBox="0 0 24 25" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path fillRule="evenodd" clipRule="evenodd" d="M22 7.64258C22 5.43344 20.2091 3.64258 18 3.64258H6C3.79086 3.64258 2 5.43344 2 7.64258V9.14258H6C7.933 9.14258 9.5 10.7096 9.5 12.6426C9.5 14.5756 7.933 16.1426 6 16.1426H2V17.6426C2 19.8517 3.79086 21.6426 6 21.6426H13C13.5523 21.6426 14 21.1949 14 20.6426V19.6426C14 17.4334 15.7909 15.6426 18 15.6426H21C21.5523 15.6426 22 15.1949 22 14.6426V7.64258ZM8 12.6426C8 11.538 7.10457 10.6426 6 10.6426H2V14.6426H6C7.10457 14.6426 8 13.7471 8 12.6426ZM22.4939 17.0781C22.8056 17.3509 22.8372 17.8247 22.5644 18.1365L19.6945 21.4163C19.0778 22.1211 18.0156 22.2155 17.2843 21.6305L15.5315 20.2282C15.208 19.9695 15.1556 19.4975 15.4143 19.1741C15.6731 18.8506 16.1451 18.7982 16.4685 19.0569L18.2213 20.4592C18.3258 20.5428 18.4776 20.5293 18.5657 20.4286L21.4356 17.1487C21.7083 16.837 22.1822 16.8054 22.4939 17.0781Z" fill="#BDBDBD" />
                                        </svg>
                                        <Typography variant={'subtitle1'} sx={{ color: "navbar.primary", fontWeight: 500 }}>Buy with Crypto</Typography>
                                    </Box>
                                    {
                                        wallet && wallet.address !== connectedWallets.filter((wallet) => wallet.id === 'inApp')[0]?.getAccount()?.address &&
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 16 16" style={{ color: "navbar.primary" }}>
                                            <path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l3.052 3.093 5.4-6.425z" />
                                        </svg>
                                    }
                                </Box> */}
                                    </Box>
                                    {/* <Box mt={3} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Box onClick={buyFractions} sx={{ cursor: "pointer", backgroundColor: "marketplace.viewMoreButtonBackground", border: 1, borderColor: "marketplace.searchButtonBorder", borderRadius: 5, py: 1, px: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, width: { xs: "100%", sm: "177px" } }}>
                                            <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "subtitle1", sm: "h6" }, color: "navbar.primary" }}>Buy</Typography>
                                            {((isPending || isApprovePending) && error.trim() === "") && <CircularProgress size={20} sx={{ color: "navbar.primary" }} />}
                                        </Box>
                                    </Box> */}
                                </Box >
                            </Box >
                        </>
                    }
                </Container>
                <Divider sx={{ backgroundColor: '#343434', mt: 9 }} />
                <Footer />
            </Box>

            <Modal
                open={fundWallet}
                onClose={() => { setIsApprovePending(false); setFundWallet(false) }}
                aria-labelledby="modal-modal-title"
                aria-describedby="modal-modal-description"
            >
                <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
                    <PayEmbed
                        client={client}
                        hiddenWallets={['walletConnect', 'inApp', 'embedded', 'adapter']}
                        payOptions={{
                            mode: "transaction",
                            onPurchaseSuccess: async (data) => {
                                if (data?.type === "transaction") {
                                    const reciept = await waitForReceipt({ transactionHash: data.transactionHash, chain: defineChain(data.chainId), client });
                                    if (reciept.status === 'success') {
                                        if (nft) {
                                            const transaction = prepareContractCall({
                                                contract,
                                                method: buyNFT,
                                                params: [BigInt(nft.nftId), BigInt(Number(params.noOfFractionsToBuy))]
                                            });
                                            sendAndConfirmTx(transaction);
                                        }
                                    }
                                    else {
                                        setError('Transaction failed');
                                    }
                                }
                                setFundWallet(false);
                                setIsApprovePending(false);
                            },
                            transaction: prepareContractCall({
                                contract: getContractByAddress(process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS!),
                                method: 'function approve(address to, uint256 amount) returns (bool)',
                                params: [contract.address, toUnits(String(totalPrice + (totalPrice * (Number(platformFee ?? 0) / 10000))), 6)],
                                erc20Value: {
                                    tokenAddress: process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS!,
                                    amountWei: toUnits(String(totalPrice + (totalPrice * (Number(platformFee ?? 0) / 10000))), 6),
                                }
                            }),
                        }}
                    />
                </Box>
            </Modal>
            <CountdownModal seconds={seconds} setSeconds={setSeconds} error={error} isPending={isPending} />
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
        </>
    )
}