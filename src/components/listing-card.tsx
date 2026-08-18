"use client";

import { Box, Button, Typography, Card, Avatar } from "@mui/material";
import formatNumberForDisplay from "@/utils/formatNumberForDisplay";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Listing } from "@/types/Listing";
import { Holding } from "@/types/Holding";
import { Asset } from "@/types/Asset";
import { NFT } from "@/types/NFT";
import Image from "next/image";

export interface NFTOwner {
    username: string;
    logo?: string;
}

type ListingCardProps = {
    item: {
        nftOwner: NFTOwner;
        nft: NFT;
        asset: Asset;
        holding?: Holding
        listing?: Listing
    };
    setTransferListing?: (listing: {
        holding: Holding;
        asset: Asset;
        nft: NFT;
    }) => void;
};

export default function ListingCard({ item, setTransferListing }: ListingCardProps) {
    const [fields, setFields] = useState<{ key: string; value: string }[]>([]);

    useEffect(() => {
        let fields = [{
            key: 'Asset Value',
            value: `$${item.nft.totalSupply * item.nft.pricePerFraction}`
        }];
        if (item.nft.metadata.propertyArea) {
            fields.push({
                key: 'Square Mt',
                value: `${item.nft.metadata.propertyArea}m²`
            });
        }
        fields = [
            ...fields,
            {
                key: 'Fractions available',
                value: `${formatNumberForDisplay(item.asset.availableSupply)}/${formatNumberForDisplay(item.nft.totalSupply)}`
            },
            {
                key: 'Price x Fraction',
                value: `$${item.asset.pricePerFraction}`
            }
        ]
        setFields(fields);
    }, [])

    const router = useRouter();

    return (
        <Card
            onClick={() => { if (!item.holding) { router.push(`/asset/${item.asset._id}`) } }}
            sx={{
                width: { xs: "100%", sm: "350px", verticalTablet: "290px", horizontalTablet: "270px" },
                cursor: item.holding ? "auto" : "pointer",
                bgcolor: "listingCard.background", borderRadius: "12px"
            }}>
            <Box sx={{ position: "relative", p: '10px', pb: '20px', height: { xs: "146px", sm: "210px" } }}>
                <Image
                    src={item.nft.metadata.imageUrls[0]}
                    alt={item.nft.metadata.nftName}
                    layout="fill"
                    objectFit="cover"
                    quality={100}
                />
                <Box sx={{ position: "absolute", top: 5, right: 5 }}>
                    <svg width="44" height="44" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect width="44" height="44" rx="22" fill="white" fillOpacity="0.16" />
                        <path d="M21.9822 32.4501C27.7645 32.4501 32.4521 27.7707 32.4521 21.9985C32.4521 16.2262 27.7645 11.5469 21.9822 11.5469C16.4963 11.5469 11.9958 15.7588 11.5488 21.1199H25.3876V22.877H11.5488C11.9958 28.2382 16.4963 32.4501 21.9822 32.4501Z" fill="white" />
                    </svg>
                </Box>
                <Box sx={{ position: "absolute", bottom: 5, left: 5 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, backgroundColor: "rgba(0, 0, 0, 0.2)", p: 1, borderRadius: 5, width: "fit-content", backdropFilter: "blur(14.5px)" }}>
                        <Avatar alt="Avatar" src={item.nftOwner.logo ?? "/svg/Avatar.svg"} sx={{ width: 24, height: 24 }} />
                        <Typography sx={{ maxWidth: "100px", color: "#FAFAFA", fontWeight: 500, fontSize: { xs: "10px", sm: "14px" }, flexGrow: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.nftOwner.username}</Typography>
                    </Box>
                </Box>
            </Box>
            <Box sx={{ px: '10px', py: '20px' }}>
                <Typography sx={{ color: "#9E9E9E", fontSize: { xs: "12px", sm: "14px" } }}>{item.nft.metadata.location ?? item.nft.metadata.city ?? "Location"}</Typography>
                <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "subtitle2", sm: "subtitle1" }, color: "listingCard.text", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.nft.metadata.nftName}</Typography>
                <Box sx={{ my: 2, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                    {fields.map((item, index) => (
                        <Box key={index} sx={{ width: "45%", flexGrow: 1 }}>
                            <Typography sx={{ color: "#9E9E9E", fontSize: { xs: "12px", sm: "14px" } }}>{item.key}</Typography>
                            <Typography style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }} sx={{ typography: { xs: "subtitle2", sm: "subtitle1" }, color: "listingCard.text" }}>{item.value}</Typography>
                        </Box>
                    ))}
                </Box>
                <Box sx={{ mb: 2, display: 'flex' }}>
                    {
                        item.asset.availableSupply !== 0 &&
                        <Box sx={{
                            flex: item.asset.availableSupply / item.nft.totalSupply,
                            bgcolor: "assetPurchase.readSlider.primary",
                            border: '1px solid #64922F',
                            height: '9px',
                            borderTopLeftRadius: '20px',
                            borderBottomLeftRadius: '20px',
                            borderRadius: (item.asset.initialSupply - item.asset.availableSupply) ? '' : '20px',
                            borderRight: (item.asset.initialSupply - item.asset.availableSupply) ? 'none' : '1px solid #64922F',
                        }} />
                    }
                    {
                        (item.asset.initialSupply - item.asset.availableSupply) !== 0 &&
                        <Box sx={{
                            flex: (item.asset.initialSupply - item.asset.availableSupply) / item.nft.totalSupply,
                            bgcolor: "assetPurchase.readSlider.secondary",
                            border: '1px solid #FF8A65',
                            height: '9px',
                            borderTopRightRadius: '20px',
                            borderBottomRightRadius: '20px',
                            borderRadius: item.asset.availableSupply !== 0 ? '' : '20px',
                        }} />
                    }
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Button
                        onClick={() => router.push(`/asset/${item.asset._id}`)}
                        sx={{ borderRadius: '40px', backgroundColor: 'marketplace.viewMoreButtonBackground', width: "100%", py: 1, px: 2.5, textTransform: "capitalize", border: 1, borderColor: "marketplace.searchButtonBorder" }}>
                        <Typography sx={{ color: "listingCard.buttonText", fontWeight: 500, whiteSpace: "nowrap" }} variant="subtitle2">
                            Buy
                        </Typography>
                    </Button>
                    <Button
                        onClick={() => { if (item.holding) router.push(`/portfolio/${item.holding._id}`) }}
                        sx={{
                            borderRadius: '40px', backgroundColor: 'marketplace.viewMoreButtonBackground', width: "100%", py: 1, px: 2.5, textTransform: "capitalize",
                            display: item.listing ? "none" : item.holding ? item.holding.quantity - item.holding.lockedQuantity === 0 ? 'none' : 'block' : 'none',
                            border: 1, borderColor: "marketplace.searchButtonBorder"
                        }}>
                        <Typography sx={{ color: "listingCard.buttonText", fontWeight: 500, whiteSpace: "nowrap" }} variant="subtitle2">
                            List
                        </Typography>
                    </Button>
                </Box>
                <Button
                    onClick={() => {
                        if (setTransferListing && item.holding) {
                            setTransferListing({
                                holding: item.holding,
                                asset: item.asset,
                                nft: item.nft
                            });
                        }
                    }}
                    endIcon={<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M8.43997 11.2047L11.4385 2.40906C11.7383 1.55948 10.8888 0.709895 10.0392 1.00975L1.2435 4.00828C0.24399 4.3581 0.24399 5.75742 1.29347 6.05727L4.24203 6.85688C4.89171 7.05678 5.44144 7.55653 5.59136 8.20621L6.39097 11.1548C6.69083 12.2043 8.09014 12.2043 8.43997 11.2047Z" fill="#ECEFF1" />
                    </svg>}
                    sx={{ borderRadius: '40px', backgroundColor: 'marketplace.viewMoreButtonBackground', width: "100%", py: 1, px: 2.5, textTransform: "capitalize", mt: 2, display: { xs: item.holding && item.holding.quantity - item.holding.lockedQuantity > 0 ? 'flex' : 'none', sm: "none" }, border: 1, borderColor: "marketplace.searchButtonBorder" }}>
                    <Typography style={{ fontWeight: 500 }} sx={{ color: "listingCard.buttonText", whiteSpace: "nowrap" }} variant="subtitle2">Send Fractions</Typography>
                </Button>
            </Box>
        </Card>
    );
}