import { Avatar, Box, Container, Divider, Typography } from "@mui/material";
import { notFound } from "next/navigation";
import AssetCard from "@/components/marketplace/asset-card";
import { listMarketplaceAssetsByBusiness } from "@/lib/db/assets";
import { getBusinessProfileByUserId } from "@/lib/db/users";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";

/**
 * Public issuer profile. Server component: shows the business_profiles
 * projection (display name and logo, the only public fields) plus that
 * issuer's marketplace assets from v_marketplace. Linked from the asset
 * detail page. Unknown ids render the 404 page.
 */
export default async function BusinessProfilePage({
    params,
}: {
    params: Promise<{ userId: string }>;
}) {
    const { userId } = await params;

    // Guard before hitting the database: the path segment must be a uuid.
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    if (!isUuid) {
        notFound();
    }

    const [profile, assets] = await Promise.all([
        getBusinessProfileByUserId(userId),
        listMarketplaceAssetsByBusiness(userId),
    ]);
    if (!profile) {
        notFound();
    }

    const totalFractions = assets.reduce((acc, asset) => acc + (asset.total_supply ?? 0), 0);
    const fractionsSold = assets.reduce(
        (acc, asset) => acc + Math.max((asset.total_supply ?? 0) - (asset.available_supply ?? 0), 0),
        0,
    );
    const stats = [
        { label: "Total Assets", value: assets.length },
        { label: "Total Fractions", value: totalFractions },
        { label: "Fractions Sold", value: fractionsSold },
    ];

    return (
        <Box sx={{ backgroundColor: "marketplace.background", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
            <Navbar />
            <Container sx={{ flexGrow: 1 }}>
                <Box sx={{ mt: 5, display: "flex", gap: 1.5, alignItems: "center" }}>
                    <Avatar
                        src={profile.logo_url ?? "/svg/Avatar.svg"}
                        alt={profile.display_name ?? "Issuer"}
                        sx={{ width: 50, height: 50 }}
                    />
                    <Typography style={{ fontWeight: 500 }} variant="h6" sx={{ color: "navbar.primary" }}>
                        {profile.display_name ?? "Issuer"}
                    </Typography>
                </Box>

                <Box sx={{ mt: 5, display: "flex", justifyContent: { sm: "center" }, gap: 1 }}>
                    {stats.map((item) => (
                        <Box key={item.label} sx={{ py: { xs: 3, sm: 4 }, borderRadius: "10px", px: { xs: 1.5, sm: 3 }, backgroundColor: "navbar.background", border: 1, borderColor: "border", flexGrow: 1 }}>
                            <Typography style={{ fontWeight: 700 }} sx={{ typography: { xs: "subtitle1", sm: "h6", horizontalTablet: "h5" }, color: "navbar.primary" }}>{item.value}</Typography>
                            <Typography sx={{ typography: { xs: "subtitle2", sm: "h6" }, color: "portfolio.secondaryText" }}>{item.label}</Typography>
                        </Box>
                    ))}
                </Box>

                <Typography variant="h5" sx={{ color: "navbar.primary", fontWeight: 500, mt: 5 }}>
                    Tokenized Assets
                </Typography>
                {assets.length === 0 ? (
                    <Typography variant="subtitle1" sx={{ color: "marketplace.filterButtonText", mt: 3 }}>
                        This issuer has no listed assets yet.
                    </Typography>
                ) : (
                    <Box sx={{ mt: { xs: 3, sm: 5 }, display: "flex", flexWrap: "wrap", alignItems: "stretch", gap: { xs: 1, sm: 2.5 } }}>
                        {assets.map((asset) => (
                            <AssetCard key={asset.asset_id} asset={asset} />
                        ))}
                    </Box>
                )}
            </Container>
            <Divider sx={{ backgroundColor: "#343434", mt: 9 }} />
            <Footer />
        </Box>
    );
}
