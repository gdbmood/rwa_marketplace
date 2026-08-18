"use client";

import { Box, Button, Chip, Container, Typography, Divider, useMediaQuery, CircularProgress, Menu, Checkbox, useColorScheme } from "@mui/material";
import ListingCard, { NFTOwner } from "@/components/listing-card";
import categoryStore from "@/store/categoryStore";
import { BusinessUser } from "@/types/Users";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import assetStore from "@/store/assetStore";
import { db } from "@/lib/firebaseClient";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import nftStore from "@/store/nftStore";
import { Asset } from "@/types/Asset";
import { NFT } from "@/types/NFT";

export default function Marketplace() {
    const params = useParams<{ assetClass: string }>()

    const { mode, setMode } = useColorScheme();

    const { nfts } = nftStore();
    const { assets, fetchAssets } = assetStore();
    const { categories, fetchCategories } = categoryStore();

    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [priceFilter, setPriceFilter] = useState<string | null>(null);
    const [filters, setFilters] = useState<{ [key: string]: string | undefined }>({});

    const [loading, setLoading] = useState(true);
    const [displayedLength, setDisplayedLength] = useState(12);
    const [filterObjs, setFilterObjs] = useState<Array<{
        nftOwner: NFTOwner
        asset: Asset
        nft: NFT
    }>>([]);
    const [search, setSearch] = useState('');

    const isSm = useMediaQuery(theme => theme.breakpoints.down('sm'));

    useEffect(() => {
        if (Object.keys(categories).length === 0) {
            fetchCategories().then(() => {
                fetchAssets().then((assets) => {
                    if (assets.length === 0) {
                        setLoading(false);
                    }
                })
            });
        }
        else {
            fetchAssets().then((assets) => {
                if (assets.length === 0) {
                    setLoading(false);
                }
            });
        }
    }, []);

    async function filterListings() {
        if (assets.length === 0) return;

        const filterdObjs: {
            nftOwner: NFTOwner
            asset: Asset
            nft: NFT
        }[] = [];
        await Promise.all(assets.map(async (asset) => {
            const nft = nfts.find((nft) => nft.nftId === Number(asset._id));
            if (nft && nft.metadata.assetClass === decodeURI(params.assetClass) && ((asset.initialSupply - asset.availableSupply) < nft.totalSupply)) {
                if (nft.metadata.nftName.toLowerCase().includes(search.toLowerCase())) {
                    let pushNft = true;
                    for (const key in filters) {
                        let keyId = key.charAt(0).toLowerCase() + key.slice(1).replace(/\s+/g, '');
                        if (!(
                            nft.metadata[keyId] && filters[key] &&
                            (
                                filters[key].includes("-") && Number(filters[key].split("-")[0]) <= Number(nft.metadata[keyId]) && Number(filters[key].split("-")[1]) > Number(nft.metadata[keyId]) ||
                                filters[key].includes("+") && Number(filters[key].split("+")[0]) <= Number(nft.metadata[keyId]) ||
                                !filters[key].includes("-") && !filters[key].includes("+") && filters[key] === nft.metadata[keyId]
                            )
                        )) {
                            pushNft = false;
                            break;
                        }
                    }
                    if (pushNft) {
                        const nftOwnerDoc = await db.collection('BusinessUser').doc(nft.nftOwner).get();
                        const data = nftOwnerDoc.data() as BusinessUser;
                        const nftOwner = {
                            username: data.displayName,
                            logo: data.logo,
                        };
                        filterdObjs.push({
                            asset,
                            nft,
                            nftOwner
                        });
                    }
                }
            }
        }));

        if (priceFilter === 'lowest') {
            filterdObjs.sort((a, b) => a.asset.pricePerFraction - b.asset.pricePerFraction);
        } else if (priceFilter === 'highest') {
            filterdObjs.sort((a, b) => b.asset.pricePerFraction - a.asset.pricePerFraction);
        }
        setFilterObjs(filterdObjs);
        setLoading(false);
    }
    useEffect(() => { filterListings() }, [assets, nfts, search, priceFilter, filters]);

    const handleClick = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
    };
    const handleClose = () => {
        setAnchorEl(null);
    };

    return (
        <Box sx={{ backgroundColor: "marketplace.background", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
            <Navbar />
            <Container sx={{ py: 3, flexGrow: 1 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Box sx={{ width: "100%", padding: 1, backgroundColor: "marketplace.searchInputBackground", display: 'flex', gap: 1.5, alignItems: 'center', borderRadius: { xs: "52px", sm: 0.5 }, border: 1, borderColor: "border" }}>
                        {!isSm && <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M15.7539 14.2549H14.9639L14.6839 13.9849C15.6639 12.8449 16.2539 11.3649 16.2539 9.75488C16.2539 6.16488 13.3439 3.25488 9.75391 3.25488C6.16391 3.25488 3.25391 6.16488 3.25391 9.75488C3.25391 13.3449 6.16391 16.2549 9.75391 16.2549C11.3639 16.2549 12.8439 15.6649 13.9839 14.6849L14.2539 14.9649V15.7549L19.2539 20.7449L20.7439 19.2549L15.7539 14.2549ZM9.75391 14.2549C7.26391 14.2549 5.25391 12.2449 5.25391 9.75488C5.25391 7.26488 7.26391 5.25488 9.75391 5.25488C12.2439 5.25488 14.2539 7.26488 14.2539 9.75488C14.2539 12.2449 12.2439 14.2549 9.75391 14.2549Z" fill="white" />
                        </svg>}
                        <input
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    setSearch((document.getElementById('search') as HTMLInputElement).value)
                                }
                            }}
                            id="search"
                            placeholder="Search for assets" className={`w-full bg-transparent outline-none ${mode === "dark" ? "text-white" : "text-black"}`} />
                        {search && <svg onClick={() => {
                            (document.getElementById('search') as HTMLInputElement).value = '';
                            setSearch('')
                        }} style={{ cursor: 'pointer' }} width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 10.5858L8.70711 7.29289L7.29289 8.70711L10.5858 12L7.29289 15.2929L8.70711 16.7071L12 13.4142L15.2929 16.7071L16.7071 15.2929L13.4142 12L16.7071 8.70711L15.2929 7.29289L12 10.5858Z" fill="white" />
                        </svg>}
                    </Box>
                    <Box onClick={() => setSearch((document.getElementById('search') as HTMLInputElement).value)}
                        sx={{ display: { xs: "none", sm: "block" }, color: "marketplace.searchButtonText", backgroundColor: "marketplace.searchInputBackground", border: 1, borderColor: "marketplace.searchButtonBorder", borderRadius: 5, py: 1, px: 3, cursor: "pointer" }}>
                        Search
                    </Box>
                    <Button onClick={handleClick} sx={{ display: { xs: "flex", verticalTablet: "none" }, p: 0, m: 0, minWidth: 0 }}>
                        <Box sx={[
                            {
                                display: 'none'
                            },
                            (theme) => theme.applyStyles('dark', {
                                display: "block"
                            })
                        ]}>
                            <svg width="44" height="44" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <rect x="0.5" y="0.5" width="39" height="39" rx="19.5" stroke="#424242" />
                                <path fillRule="evenodd" clipRule="evenodd" d="M11.875 20C11.875 18.951 12.5798 18.0666 13.5417 17.7946L13.5417 12.5C13.5417 12.1548 13.8215 11.875 14.1667 11.875C14.5118 11.875 14.7917 12.1548 14.7917 12.5L14.7917 17.7946C15.7535 18.0667 16.4583 18.951 16.4583 20C16.4583 21.049 15.7535 21.9333 14.7917 22.2054L14.7917 27.5C14.7917 27.8452 14.5118 28.125 14.1667 28.125C13.8215 28.125 13.5417 27.8452 13.5417 27.5L13.5417 22.2054C12.5798 21.9333 11.875 21.049 11.875 20ZM20.625 13.6279V12.5C20.625 12.1548 20.3452 11.875 20 11.875C19.6548 11.875 19.375 12.1548 19.375 12.5V13.6279C18.4131 13.9 17.7083 14.7844 17.7083 15.8333C17.7083 17.099 18.7343 18.125 20 18.125C21.2657 18.125 22.2917 17.099 22.2917 15.8333C22.2917 14.7844 21.5869 13.9 20.625 13.6279ZM20 28.125C19.6548 28.125 19.375 27.8452 19.375 27.5L19.375 20C19.375 19.6548 19.6548 19.375 20 19.375C20.3452 19.375 20.625 19.6548 20.625 20V27.5C20.625 27.8452 20.3452 28.125 20 28.125ZM25.8333 20.625C25.4882 20.625 25.2083 20.3452 25.2083 20V12.5C25.2083 12.1548 25.4882 11.875 25.8333 11.875C26.1785 11.875 26.4583 12.1548 26.4583 12.5V20C26.4583 20.3452 26.1785 20.625 25.8333 20.625ZM25.8333 28.125C25.4882 28.125 25.2083 27.8452 25.2083 27.5V26.3721C24.2465 26.1 23.5417 25.2156 23.5417 24.1667C23.5417 22.901 24.5677 21.875 25.8333 21.875C27.099 21.875 28.125 22.901 28.125 24.1667C28.125 25.2156 27.4202 26.1 26.4583 26.3721V27.5C26.4583 27.8452 26.1785 28.125 25.8333 28.125Z" fill="#BDBDBD" />
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
                            <svg width="44" height="44" viewBox="0 0 42 42" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <rect x="0.5" y="0.5" width="41" height="41" rx="20.5" fill="#F5F5F5" />
                                <rect x="0.5" y="0.5" width="41" height="41" rx="20.5" stroke="#E0E0E0" />
                                <path fillRule="evenodd" clipRule="evenodd" d="M12.875 21C12.875 19.951 13.5798 19.0666 14.5417 18.7946L14.5417 13.5C14.5417 13.1548 14.8215 12.875 15.1667 12.875C15.5118 12.875 15.7917 13.1548 15.7917 13.5L15.7917 18.7946C16.7535 19.0667 17.4583 19.951 17.4583 21C17.4583 22.049 16.7535 22.9333 15.7917 23.2054L15.7917 28.5C15.7917 28.8452 15.5118 29.125 15.1667 29.125C14.8215 29.125 14.5417 28.8452 14.5417 28.5L14.5417 23.2054C13.5798 22.9333 12.875 22.049 12.875 21ZM21.625 14.6279V13.5C21.625 13.1548 21.3452 12.875 21 12.875C20.6548 12.875 20.375 13.1548 20.375 13.5V14.6279C19.4131 14.9 18.7083 15.7844 18.7083 16.8333C18.7083 18.099 19.7343 19.125 21 19.125C22.2657 19.125 23.2917 18.099 23.2917 16.8333C23.2917 15.7844 22.5869 14.9 21.625 14.6279ZM21 29.125C20.6548 29.125 20.375 28.8452 20.375 28.5L20.375 21C20.375 20.6548 20.6548 20.375 21 20.375C21.3452 20.375 21.625 20.6548 21.625 21V28.5C21.625 28.8452 21.3452 29.125 21 29.125ZM26.8333 21.625C26.4882 21.625 26.2083 21.3452 26.2083 21V13.5C26.2083 13.1548 26.4882 12.875 26.8333 12.875C27.1785 12.875 27.4583 13.1548 27.4583 13.5V21C27.4583 21.3452 27.1785 21.625 26.8333 21.625ZM26.8333 29.125C26.4882 29.125 26.2083 28.8452 26.2083 28.5V27.3721C25.2465 27.1 24.5417 26.2156 24.5417 25.1667C24.5417 23.901 25.5677 22.875 26.8333 22.875C28.099 22.875 29.125 23.901 29.125 25.1667C29.125 26.2156 28.4202 27.1 27.4583 27.3721V28.5C27.4583 28.8452 27.1785 29.125 26.8333 29.125Z" fill="#757575" />
                            </svg>
                        </Box>
                    </Button>
                    <Box onClick={handleClick} sx={{ display: { xs: "none", verticalTablet: "flex" }, alignItems: "center", borderRadius: 12, px: 2, py: 1, border: 1, borderColor: 'border', cursor: "pointer" }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path fillRule="evenodd" clipRule="evenodd" d="M2.25 12C2.25 10.7412 3.09575 9.67998 4.25 9.35352L4.25 3C4.25 2.58579 4.58579 2.25 5 2.25C5.41421 2.25 5.75 2.58579 5.75 3L5.75 9.35352C6.90425 9.67998 7.75 10.7412 7.75 12C7.75 13.2588 6.90425 14.32 5.75 14.6465L5.75 21C5.75 21.4142 5.41421 21.75 5 21.75C4.58579 21.75 4.25 21.4142 4.25 21L4.25 14.6465C3.09575 14.32 2.25 13.2588 2.25 12ZM12.75 4.35352V3C12.75 2.58579 12.4142 2.25 12 2.25C11.5858 2.25 11.25 2.58579 11.25 3V4.35352C10.0957 4.67998 9.25 5.74122 9.25 7C9.25 8.51878 10.4812 9.75 12 9.75C13.5188 9.75 14.75 8.51878 14.75 7C14.75 5.74122 13.9043 4.67998 12.75 4.35352ZM12 21.75C11.5858 21.75 11.25 21.4142 11.25 21V12C11.25 11.5858 11.5858 11.25 12 11.25C12.4142 11.25 12.75 11.5858 12.75 12V21C12.75 21.4142 12.4142 21.75 12 21.75ZM19 12.75C18.5858 12.75 18.25 12.4142 18.25 12V3C18.25 2.58579 18.5858 2.25 19 2.25C19.4142 2.25 19.75 2.58579 19.75 3V12C19.75 12.4142 19.4142 12.75 19 12.75ZM19 21.75C18.5858 21.75 18.25 21.4142 18.25 21V19.6465C17.0957 19.32 16.25 18.2588 16.25 17C16.25 15.4812 17.4812 14.25 19 14.25C20.5188 14.25 21.75 15.4812 21.75 17C21.75 18.2588 20.9043 19.32 19.75 19.6465V21C19.75 21.4142 19.4142 21.75 19 21.75Z" fill="#BDBDBD" />
                        </svg>
                        <Typography variant="subtitle1" sx={{ color: "marketplace.filterButtonText", px: 1 }}>Filter</Typography>
                        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M0 0.5L5 5.5L10 0.5H0Z" fill="#757575" />
                        </svg>
                    </Box>
                    <Menu
                        id="basic-menu"
                        anchorEl={anchorEl}
                        open={Boolean(anchorEl)}
                        onClose={handleClose}
                        MenuListProps={{
                            'aria-labelledby': 'basic-button',
                        }}
                        sx={{
                            "& .MuiMenu-paper": {
                                backgroundColor: "marketplace.filterMenuBackground",
                                borderRadius: 2,
                                marginTop: 1,
                                width: { xs: "348px", horizontalTablet: "475px" },
                                px: 1.5,
                            },
                        }}
                    >
                        <Box>
                            <Typography style={{ fontWeight: 500 }} sx={{ color: "navbar.primary", fontSize: "18px" }}>Price</Typography>
                            {['Lowest', 'Highest'].map((item, index) => (
                                <Box key={index} sx={{ display: "flex", alignItems: "center" }}>
                                    <Checkbox
                                        checked={priceFilter === item.toLowerCase()}
                                        onChange={(e) => {
                                            if (e.target.checked)
                                                setPriceFilter(item.toLowerCase())
                                            else
                                                setPriceFilter(null)
                                        }}
                                        sx={{
                                            color: "#BDBDBD",
                                            '&.Mui-checked': {
                                                color: "marketplace.categoryFilter.background"
                                            }
                                        }} />
                                    <Typography variant="subtitle1" sx={{ color: "navbar.primary" }}>{item} price</Typography>
                                </Box>
                            ))}
                        </Box>
                        {categories.find(c => c.name === decodeURI(params.assetClass))?.fields.map((item, index) => {
                            if ('filterOptions' in item && item.filterOptions) {
                                return (
                                    <Box key={index}>
                                        <Typography style={{ fontWeight: 500 }} sx={{ color: "navbar.primary", fontSize: "18px" }}>{item.name}</Typography>
                                        {item.filterOptions.map((option, index) => (
                                            <Box key={index} sx={{ display: "flex", alignItems: "center" }}>
                                                <Checkbox
                                                    checked={filters[item.name] === option}
                                                    onChange={(e) => {
                                                        if (e.target.checked)
                                                            setFilters({ ...filters, [item.name]: option })
                                                        else {
                                                            const newFilters = { ...filters };
                                                            delete newFilters[item.name];
                                                            setFilters(newFilters);
                                                        }
                                                    }}
                                                    sx={{
                                                        color: "#BDBDBD",
                                                        '&.Mui-checked': {
                                                            color: "marketplace.categoryFilter.background"
                                                        }
                                                    }} />
                                                <Typography variant="subtitle1" sx={{ color: "navbar.primary" }}>{option}</Typography>
                                            </Box>
                                        ))}
                                    </Box>
                                )
                            }
                            else if ('filter' in item && item.filter) {
                                return (
                                    <Box key={index}>
                                        <Typography style={{ fontWeight: 500 }} sx={{ color: "navbar.primary", fontSize: "18px" }}>{item.name}</Typography>
                                        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mt: 1.5 }}>
                                            {item.options.map((option, index) => (
                                                <Chip key={index}
                                                    label={option}
                                                    sx={{
                                                        px: 1,
                                                        fontFamily: 'Roboto',
                                                        flexGrow: { xs: 1, sm: 0 },
                                                        backgroundColor: filters[item.name] === option ? 'marketplace.categoryFilter.background' : 'navbar.background',
                                                        border: filters[item.name] === option ? '' : 1,
                                                        borderColor: filters[item.name] === option ? '' : 'border',
                                                        color: filters[item.name] === option ? 'marketplace.categoryFilter.text' : 'marketplace.filterButtonText',
                                                        '&:hover': {
                                                            backgroundColor: filters[item.name] === option ? 'marketplace.categoryFilter.background' : 'navbar.background',
                                                            border: filters[item.name] === option ? '' : 1,
                                                            borderColor: filters[item.name] === option ? '' : 'border',
                                                            color: filters[item.name] === option ? 'marketplace.categoryFilter.text' : 'marketplace.filterButtonText',
                                                        }
                                                    }}
                                                    onClick={() => setFilters({ ...filters, [item.name]: option })} />
                                            ))}
                                        </Box>
                                    </Box>
                                )
                            }
                            return null;
                        })}
                    </Menu>
                </Box>
                {
                    loading ?
                        <Box sx={{ mt: 5, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                            <CircularProgress sx={{ color: '#C6FF00' }} />
                        </Box>
                        :
                        <Box sx={{ mt: { xs: 3, sm: 5, horizontalTablet: 7 }, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: { xs: 1, sm: 2.5 } }}>
                            {filterObjs.length > 0 ?
                                filterObjs.slice(0, displayedLength).map((item, index) => (
                                    <ListingCard key={index} item={item} />
                                ))
                                :
                                <Box sx={{ width: '100%', textAlign: 'center', mt: 5 }}>
                                    <Typography variant="h6" sx={{ color: "navbar.primary" }}>No listings found</Typography>
                                </Box>
                            }
                        </Box>
                }
                <Box sx={{ mt: 7.5, mb: 6, display: (assets.length && nfts.length && filterObjs.length > displayedLength) ? 'flex' : 'none', alignItems: "center", justifyContent: "center" }}>
                    <Button onClick={() => setDisplayedLength(displayedLength + 4)} variant="contained" sx={{ backgroundColor: "marketplace.viewMoreButtonBackground", color: "marketplace.searchButtonText", border: 1, borderColor: "marketplace.searchButtonBorder", borderRadius: 5, py: 1, px: 3 }}>View More</Button>
                </Box>
            </Container>
            <Divider sx={{ backgroundColor: '#343434' }} />
            <Footer />
        </Box>
    )
}