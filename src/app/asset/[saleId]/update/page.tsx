import { redirect } from "next/navigation";
import BusinessAuthGate from "@/components/business/auth-gate";
import UpdateAssetView from "@/components/business/update-asset-view";
import { BusinessPageShell, NotBusinessNotice } from "@/components/business/page-shell";
import { draftFormValues, getBusinessGate, loadCategoryDtos } from "@/components/business/server";
import { getAssetById, getAssetByNftId, type AssetRow } from "@/lib/db/assets";
import { getActiveListingsForAsset } from "@/lib/db/listings";
import { parseNumeric } from "@/lib/db/numeric";
import type { PrimaryListingDto } from "@/components/business/types";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

async function loadAsset(saleId: string): Promise<AssetRow | null> {
    if (UUID_PATTERN.test(saleId)) {
        return getAssetById(saleId).catch(() => null);
    }
    const nftId = Number(saleId);
    if (!Number.isInteger(nftId) || nftId < 0) {
        return null;
    }
    return getAssetByNftId(nftId).catch(() => null);
}

/**
 * Business-only listing management for a minted asset (metadata, primary
 * price, delist). Ownership is enforced server side; investors and other
 * businesses are redirected away.
 */
export default async function UpdateAssetPage(props: {
    params: Promise<{ saleId: string }>;
}) {
    const gate = await getBusinessGate();

    if (gate.status === "unauthenticated") {
        return (
            <BusinessPageShell>
                <BusinessAuthGate message="Connect your business wallet to manage this asset" />
            </BusinessPageShell>
        );
    }
    if (gate.status === "not_business") {
        return (
            <BusinessPageShell>
                <NotBusinessNotice />
            </BusinessPageShell>
        );
    }
    if (gate.status === "unverified") {
        redirect("/verify-business");
    }

    const { saleId } = await props.params;
    const asset = await loadAsset(saleId);
    if (!asset || asset.business_id !== gate.user.id) {
        redirect("/dashboard");
    }
    if (asset.status === "draft") {
        redirect(`/list-new-asset?draft=${asset.id}`);
    }
    if (asset.status !== "active" || asset.nft_id === null) {
        redirect("/dashboard");
    }

    const [categories, listings] = await Promise.all([
        loadCategoryDtos(),
        getActiveListingsForAsset(asset.id),
    ]);

    const primaryRow = listings.find(
        (listing) => listing.kind === "primary" && listing.lister_id === gate.user.id,
    );
    const primaryListing: PrimaryListingDto | null = primaryRow
        ? {
            id: primaryRow.id,
            quantity: primaryRow.quantity,
            pricePerFraction: parseNumeric(primaryRow.price_per_fraction) ?? 0,
        }
        : null;

    const initialValues = draftFormValues(asset, categories);
    if (initialValues.valuation === 0 && asset.total_supply) {
        const price =
            primaryListing?.pricePerFraction ?? parseNumeric(asset.mint_price_per_fraction) ?? 0;
        initialValues.valuation = Math.round(price * asset.total_supply * 1e6) / 1e6;
    }
    if (initialValues.fractions === 0 && asset.total_supply) {
        initialValues.fractions = asset.total_supply;
    }

    return (
        <BusinessPageShell>
            <UpdateAssetView
                asset={{ id: asset.id, nftId: asset.nft_id, name: asset.name }}
                categories={categories}
                initialValues={initialValues}
                primaryListing={primaryListing}
            />
        </BusinessPageShell>
    );
}
