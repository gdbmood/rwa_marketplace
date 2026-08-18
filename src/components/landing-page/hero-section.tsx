import { initializeFirebaseAdminApp } from '@/lib/firebaseServer';
import ListingCard, { NFTOwner } from '@/components/listing-card';
import GetStartedButton from '@/components/get-started-button';
import { Box, Typography, Container } from '@mui/material';
import { getFirestore } from 'firebase-admin/firestore';
import { BusinessUser } from '@/types/Users';
import fetchNFTs from '@/utils/fetchNFTs';
import { Asset } from '@/types/Asset';
import Image from 'next/image';

export default async function HeroSection() {
    initializeFirebaseAdminApp()

    const db = getFirestore();

    const nfts = await fetchNFTs();
    const assets = await db.collection('Asset').get().then((snapshot) => {
        return snapshot.docs.map((doc) => ({ _id: doc.id, ...doc.data() }) as Asset)
    });
    const filterObjsRaw = await Promise.all(assets.map(async (asset) => {
        const nft = nfts.find((nft) => nft.nftId === Number(asset._id));
        if (!nft) return null;

        const nftOwnerSnapshot = await db.collection('BusinessUser').doc(nft.nftOwner).get();
        const nftOwnerData = nftOwnerSnapshot.data() as BusinessUser | undefined;

        return {
            nft: nft,
            asset: asset,
            nftOwner: {
                username: nftOwnerData?.displayName || '',
                logo: nftOwnerData?.logo
            } as NFTOwner
        };
    }));
    const filterObjs = filterObjsRaw
        .filter(item => item !== null)
        .sort((a, b) => { return b.asset.pricePerFraction - a.asset.pricePerFraction });

    return (
        <Box sx={{
            backgroundImage: 'url(/img/Body31.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            paddingTop: { xs: 3, horizontalTablet: 10 }
        }}>
            <Container>
                <Box sx={{ textAlign: 'center' }}>
                    <Typography sx={{ typography: { xs: 'subtitle1', sm: 'h6' }, color: '#BDBDBD', py: '10px' }}>
                        Turn physical assets into liquid investments
                    </Typography>
                    <Typography style={{ fontWeight: 700 }} sx={{ typography: { xs: 'h6', sm: 'h4', horizontalTablet: 'h3' }, color: '#C6FF00', py: { xs: '0px', sm: '10px' } }}>
                        Bridging Reality and Blockchain
                    </Typography>
                    <Typography sx={{ typography: { xs: 'subtitle1', verticalTablet: 'h5' }, color: '#FAFAFA', py: '10px' }}>
                        Where blockchain meets tangible investments with Fractionnaire. Navigate through our platform to explore seamless asset tokenization. Click 'Get Started' to begin your journey into decentralized finance.
                    </Typography>
                </Box>

                <Box sx={{ mt: { xs: 3, sm: 5, horizontalTablet: 7 }, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: { xs: 1, sm: 2.5 } }}>
                    {filterObjs.slice(0, 4).map((item, index) => (
                        <ListingCard key={index} item={item} />
                    ))}
                </Box>

                <Box sx={{ display: { xs: "block", horizontalTablet: "none" }, mt: { xs: 2, sm: 5 }, px: { xs: 0, sm: 2, verticalTablet: 10 } }}>
                    <GetStartedButton />
                </Box>

                <Box sx={{ mt: { xs: 6, sm: 10, horizontalTablet: 5 }, display: 'flex', alignItems: 'center', gap: 3, flexDirection: { xs: 'column', sm: 'row' } }}>
                    <Box sx={{ flex: 1 }}>
                        <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h6", sm: "h5", horizontalTablet: "h4" }, color: '#FAFAFA', textAlign: { xs: "center", sm: "left" } }}>
                            <span style={{ color: '#C6FF00' }}>Real Assets,</span> Digital Ownership
                        </Typography>
                        <Typography sx={{ typography: { xs: "subtitle1", horizontalTablet: "h5" }, mt: { xs: 1.5, sm: 3 }, color: '#BDBDBD', textAlign: { xs: "center", sm: "left" } }}>
                            Leverage blockchain-powered tokenization to invest, trade, and manage real-world assets with ease. Secure, transparent, and efficient.
                        </Typography>
                    </Box>
                    <Box sx={{ flex: 1, width: "100%" }}>
                        <Image src="/webp/Frame 264.webp" alt="real estate" width={0} height={0} sizes="100vw" style={{ objectFit: 'cover', display: 'block', margin: 'auto', width: '100%', height: '100%' }} />
                    </Box>
                </Box>
            </Container >
        </Box >
    )
}
