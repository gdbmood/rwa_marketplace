import { Box, Typography, Container } from '@mui/material';
import GetStartedButton from '@/components/get-started-button';
import AssetCard from '@/components/marketplace/asset-card';
import { type MarketplaceAssetRow, listMarketplaceAssets } from '@/lib/db/assets';
import Image from 'next/image';

/**
 * Landing hero. Server component: reads the public v_marketplace view through
 * the repository layer and shows the four highest priced active assets. A
 * failed read renders the hero without the cards instead of crashing the
 * landing page.
 */
export default async function HeroSection() {
    let featured: MarketplaceAssetRow[] = [];
    try {
        const assets = await listMarketplaceAssets();
        featured = assets
            .slice()
            .sort(
                (a, b) =>
                    (b.floor_price_per_fraction ?? b.mint_price_per_fraction ?? 0) -
                    (a.floor_price_per_fraction ?? a.mint_price_per_fraction ?? 0),
            )
            .slice(0, 4);
    } catch (error) {
        console.error('HeroSection: could not load featured assets:', error);
    }

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
                        Where blockchain meets tangible investments with Fractionnaire. Navigate through our platform to explore seamless asset tokenization. Click &apos;Get Started&apos; to begin your journey into decentralized finance.
                    </Typography>
                </Box>

                {featured.length > 0 && (
                    <Box sx={{ mt: { xs: 3, sm: 5, horizontalTablet: 7 }, display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: { xs: 1, sm: 2.5 } }}>
                        {featured.map((asset) => (
                            <AssetCard key={asset.asset_id} asset={asset} />
                        ))}
                    </Box>
                )}

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
