"use client";

import { Box, Chip, CircularProgress, Container, Divider, Typography } from '@mui/material'
import { useParams, useRouter } from 'next/navigation';
import { db, storage } from '@/lib/firebaseClient';
import { BusinessUser } from '@/types/Users';
import { useEffect, useState } from 'react';
import assetStore from '@/store/assetStore';
import Footer from "@/components/footer";
import Navbar from '@/components/navbar';
import nftStore from '@/store/nftStore';
import { NFT } from '@/types/NFT';
import Image from 'next/image';
import Link from 'next/link';

export default function AssetDocsPage() {
    const router = useRouter();
    const params = useParams<{ saleId: string }>()

    const { nfts } = nftStore();
    const { assets, fetchAssets } = assetStore();

    const [loading, setLoading] = useState(true);
    const [documents, setDocuments] = useState<{
        name: string,
        size: number,
        url: string
    }[]>([]);
    const [assetOwner, setAssetOwner] = useState<string | null>(null);
    const [nft, setNft] = useState<NFT | null>(null);

    useEffect(() => {
        if (!assets.length) {
            fetchAssets().then((newAssets) => {
                if (newAssets.length === 0) {
                    router.push('/marketplace')
                }
            })
        }
    }, []);
    useEffect(() => {
        (async () => {
            if (assets.length) {
                const asset = assets.filter(asset => asset._id === params.saleId);
                if (asset) {
                    const nft = nfts.find(nft => nft.nftId === Number(asset[0]._id));
                    if (nft) {
                        const docs: {
                            name: string,
                            size: number,
                            url: string
                        }[] = [];
                        // Fixme:
                        await Promise.all(nft.metadata.documentUrls[Object.keys(nft.metadata.documentUrls)[0]].map(async (item) => {
                            const meta = await storage.refFromURL(item).getMetadata();
                            docs.push({
                                name: decodeURIComponent(item).split('?')[0].split('/').pop() || '',
                                size: Math.round(meta.size / 1024),
                                url: item
                            })
                        }))
                        await db.collection('BusinessUser').doc(asset[0].minterId).get().then((doc) => {
                            if (doc.exists) {
                                const assetOwner = doc.data() as BusinessUser;
                                setAssetOwner(assetOwner.displayName || null);
                            }
                        })

                        setNft(nft)
                        setDocuments(docs)
                        setLoading(false)
                    }
                    else {
                        router.push('/marketplace')
                    }
                }
                else {
                    router.push('/marketplace')
                }
            }
        })()
    }, [assets])

    return (
        <Box sx={{ backgroundColor: "marketplace.background", display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <Navbar />
            <Container sx={{ my: 4, py: 3, flexGrow: 1 }}>
                {
                    loading ?
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                            <CircularProgress sx={{ color: "#C6FF00" }} />
                        </Box>
                        :
                        <>
                            <Box sx={{ display: 'flex', alignItems: "center", gap: 2, flexWrap: 'wrap' }}>
                                <Chip sx={{ color: "marketplace.filterButtonText", border: 1, borderColor: "border", fontFamily: "Roboto", py: 1, px: 2.5 }} label={assetOwner} />
                                <Chip sx={{ color: "marketplace.filterButtonText", border: 1, borderColor: "border", fontFamily: "Roboto", py: 1, px: 2.5 }} label={nft?.metadata.assetClass} />
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
                            <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h6", sm: "h5" }, py: 3, color: "navbar.primary" }}>{nft?.metadata.nftName}</Typography>
                            <Typography variant='subtitle1' sx={{ color: "assetPurchase.documentRedirectSecondaryText", textAlign: 'justify' }}>{nft?.metadata.description}</Typography>
                            <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h6", sm: "h5" }, py: 3, color: "navbar.primary" }}>Documents confirming ownership</Typography>
                            {documents.map((item, index) => (
                                <Box key={index} sx={{ bgcolor: "assetPurchase.documentRedirectBackground", border: 1, borderColor: "assetPurchase.documentRedirectBorder", borderRadius: 0.5, p: 2, display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2.5 }}>
                                    <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                                        <Image src="/svg/Avatar(1).svg" width={50} height={50} alt='' />
                                        <Box>
                                            <Typography variant='subtitle1' sx={{ color: "navbar.primary" }}>{item.name}</Typography>
                                            <Typography variant='subtitle2' sx={{ color: "portfolio.secondaryText" }}>{item.size}kb</Typography>
                                        </Box>
                                    </Box>
                                    <Link href={item.url} target="_blank">
                                        <svg width="24" height="25" viewBox="0 0 24 25" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M5 20.3213H19V18.3213H5V20.3213ZM19 9.32129H15V3.32129H9V9.32129H5L12 16.3213L19 9.32129Z" fill="#FAFAFA" />
                                        </svg>
                                    </Link>
                                </Box>
                            ))}
                        </>
                }
            </Container>
            <Divider sx={{ backgroundColor: '#343434', mt: 9 }} />
            <Footer />
        </Box>
    )
}