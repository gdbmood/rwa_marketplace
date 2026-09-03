"use client";

import { Box, Button, CircularProgress, Modal, Typography } from "@mui/material";
import { prepareContractCall, sendAndConfirmTransaction } from "thirdweb";
import { useActiveAccountCompat } from "@/hooks/useActiveAccountCompat";
import { contract } from "@/lib/thirdWebClient";
import { unlistNFT, updateListing } from "@/utils/ABI";
import { cancelListing, updateListingPrice } from "@/actions/listings";
import AssetForm from "@/components/business/asset-form";
import { resolveDocumentUploads, resolveUploads } from "@/components/business/upload-client";
import {
    type AssetFormValues,
    type CategoryDto,
    type PrimaryListingDto,
    buildOnChainMetadata,
    pricePerFraction,
    usdcToMicro,
    validateAssetValues,
} from "@/components/business/types";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export interface UpdatableAsset {
    id: string;
    nftId: number;
    name: string;
}

/**
 * Business listing management for a live asset: update the metadata and
 * primary price (updateListing on chain, then the updateListingPrice action)
 * and delist the remaining primary fractions (unlistFractions on chain, then
 * the cancelListing action).
 */
export default function UpdateAssetView(props: {
    asset: UpdatableAsset;
    categories: CategoryDto[];
    initialValues: AssetFormValues;
    primaryListing: PrimaryListingDto | null;
}) {
    const router = useRouter();
    const wallet = useActiveAccountCompat();

    const [values, setValues] = useState<AssetFormValues>(props.initialValues);
    const [error, setError] = useState("");
    const [updating, setUpdating] = useState(false);
    const [updateDone, setUpdateDone] = useState(false);

    const [delistOpen, setDelistOpen] = useState(false);
    const [delistError, setDelistError] = useState("");
    const [delisting, setDelisting] = useState(false);
    const [delistDone, setDelistDone] = useState(false);

    useEffect(() => {
        if (error.trim().length > 0) {
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    }, [error]);

    const category = props.categories.find((c) => c.id === values.categoryId) ?? props.categories[0];

    async function submitUpdate() {
        setError("");
        if (!wallet) {
            setError("Please connect your wallet");
            return;
        }
        const validationError = validateAssetValues(values, category);
        if (validationError) {
            setError(validationError);
            return;
        }

        setUpdating(true);
        try {
            const imageUrls = await resolveUploads(values.images, "image");
            const documentUrls = await resolveDocumentUploads(values.documents);
            setValues((current) => ({ ...current, images: imageUrls, documents: documentUrls }));

            const metadata = buildOnChainMetadata(values, category.name, imageUrls, documentUrls);
            const newPrice = pricePerFraction(values.valuation, values.fractions);

            const transaction = prepareContractCall({
                contract,
                method: updateListing,
                params: [
                    BigInt(props.asset.nftId),
                    usdcToMicro(values.valuation / values.fractions),
                    JSON.stringify(metadata),
                ],
            });
            const receipt = await sendAndConfirmTransaction({ transaction, account: wallet });

            if (props.primaryListing) {
                const recorded = await updateListingPrice({
                    listingId: props.primaryListing.id,
                    newPrice,
                    txHash: receipt.transactionHash,
                });
                if (!recorded.ok) {
                    setError(`The chain update succeeded but recording the new price failed: ${recorded.error.message}`);
                    return;
                }
            }
            setUpdateDone(true);
        } catch (updateError) {
            setError(updateError instanceof Error ? updateError.message : "Update failed, please try again");
        } finally {
            setUpdating(false);
        }
    }

    async function submitDelist() {
        setDelistError("");
        if (!wallet) {
            setDelistError("Please connect your wallet");
            return;
        }
        const listing = props.primaryListing;
        if (!listing) {
            setDelistError("There is no active primary listing to delist");
            return;
        }

        setDelisting(true);
        try {
            const transaction = prepareContractCall({
                contract,
                method: unlistNFT,
                params: [BigInt(props.asset.nftId), usdcToMicro(listing.pricePerFraction)],
            });
            const receipt = await sendAndConfirmTransaction({ transaction, account: wallet });

            const recorded = await cancelListing({
                listingId: listing.id,
                txHash: receipt.transactionHash,
            });
            if (!recorded.ok) {
                setDelistError(`The chain delist succeeded but recording it failed: ${recorded.error.message}`);
                return;
            }
            setDelistDone(true);
        } catch (delistTxError) {
            setDelistError(delistTxError instanceof Error ? delistTxError.message : "Delist failed, please try again");
        } finally {
            setDelisting(false);
        }
    }

    return (
        <>
            <Modal open={updateDone} aria-labelledby="update-success">
                <Box sx={{ position: { sm: "absolute" }, top: "50%", left: "50%", transform: { sm: "translate(-50%, -50%)" }, bgcolor: "marketplace.background", px: { xs: 3.5, sm: 5, verticalTablet: 12 }, py: 10, width: { xs: "100%", sm: "90%", horizontalTablet: "65%" }, overflowY: "auto", height: { xs: "100%", sm: "auto" }, display: "flex", alignItems: "center", flexDirection: "column" }}>
                    <Image src="/webp/party-popper.webp" width={100} height={100} alt="confirm" />
                    <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h6", sm: "h4" }, color: "navbar.primary", my: { xs: 3, sm: 5 }, textAlign: "center" }}>
                        Asset updated successfully!
                    </Typography>
                    <Button onClick={() => router.push("/dashboard")} variant="contained" sx={{ backgroundColor: "marketplace.viewMoreButtonBackground", borderRadius: 5, border: 1, borderColor: "marketplace.searchButtonBorder", py: 1, px: 3, height: "55px", width: { xs: "290px", sm: "344px", verticalTablet: "480px" } }}>
                        <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "subtitle1", horizontalTablet: "h6" }, color: "navbar.primary" }}>Go to dashboard</Typography>
                    </Button>
                </Box>
            </Modal>

            <Modal open={delistOpen} onClose={() => { if (!delisting && !delistDone) { setDelistOpen(false); } }} aria-labelledby="delist-confirm">
                <Box sx={{ position: { sm: "absolute" }, top: "50%", left: "50%", transform: { sm: "translate(-50%, -50%)" }, bgcolor: "marketplace.background", px: { xs: 3.5, sm: 5, verticalTablet: 12 }, py: 8, width: { xs: "100%", sm: "90%", horizontalTablet: "55%" }, overflowY: "auto", height: { xs: "100%", sm: "auto" }, display: "flex", alignItems: "center", flexDirection: "column" }}>
                    {delistDone ? (
                        <>
                            <Image src="/webp/party-popper.webp" width={100} height={100} alt="confirm" />
                            <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h6", sm: "h4" }, color: "navbar.primary", my: { xs: 3, sm: 5 }, textAlign: "center" }}>
                                Remaining fractions delisted
                            </Typography>
                            <Button onClick={() => router.push("/dashboard")} variant="contained" sx={{ backgroundColor: "marketplace.viewMoreButtonBackground", borderRadius: 5, border: 1, borderColor: "marketplace.searchButtonBorder", py: 1, px: 3, height: "55px", width: { xs: "290px", sm: "344px", verticalTablet: "480px" } }}>
                                <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "subtitle1", horizontalTablet: "h6" }, color: "navbar.primary" }}>Go to dashboard</Typography>
                            </Button>
                        </>
                    ) : (
                        <>
                            <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h6", sm: "h5" }, color: "navbar.primary", textAlign: "center" }}>
                                Delist the remaining fractions?
                            </Typography>
                            <Typography variant="subtitle1" sx={{ color: "assetPurchase.documentRedirectSecondaryText", mt: 2, textAlign: "center" }}>
                                {props.primaryListing?.quantity ?? 0} unsold fraction(s) of {props.asset.name} will be removed from the marketplace. Buyers who already own fractions keep them.
                            </Typography>
                            {delistError && <Typography variant="subtitle2" sx={{ color: "red", mt: 2, textAlign: "center" }}>{delistError}</Typography>}
                            <Box sx={{ display: "flex", gap: 2, mt: 5, flexWrap: "wrap", justifyContent: "center" }}>
                                <Button disabled={delisting} onClick={() => setDelistOpen(false)} variant="contained" sx={{ backgroundColor: "marketplace.viewMoreButtonBackground", borderRadius: 5, border: 1, borderColor: "marketplace.searchButtonBorder", py: 1, px: 4, color: "navbar.primary" }}>
                                    Keep it listed
                                </Button>
                                <Button
                                    disabled={delisting}
                                    endIcon={delisting && <CircularProgress size={20} sx={{ color: "#FFFFFF" }} />}
                                    onClick={submitDelist}
                                    variant="contained"
                                    sx={{ backgroundColor: "marketplace.categoryFilter.text", borderRadius: 5, py: 1, px: 4, color: "marketplace.filterButtonText", ":hover": { backgroundColor: "#EF5350", color: "#FFFFFF" } }}
                                >
                                    Delist fractions
                                </Button>
                            </Box>
                        </>
                    )}
                </Box>
            </Modal>

            <Box sx={[
                {
                    pt: { xs: 4, sm: 9 }, pb: { xs: 0, sm: 9 }, display: "flex", justifyContent: "center",
                    backgroundImage: `image-set(url('/img/signup-bg-light.png') 1x, url('/img/signup-bg-light.png') 2x)`,
                    backgroundSize: "contain", minHeight: "100vh",
                },
                (theme) => theme.applyStyles("dark", {
                    backgroundImage: `image-set(url('/img/signup-bg.png') 1x, url('/img/signup-bg.png') 2x)`,
                }),
            ]}>
                <Box sx={{ px: { xs: "20px", sm: "58px", verticalTablet: "150px" }, py: 3, backgroundColor: "listNewAsset.background", border: { sm: 1 }, borderColor: { sm: "border" }, borderRadius: 2.5, width: { xs: "100%", sm: "90%", verticalTablet: "780px" } }}>
                    <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h5", sm: "h3" }, color: "marketplace.categoryFilter.background", mb: 4, width: "100%", textAlign: "center" }}>
                        Update the asset
                    </Typography>
                    {error && <Typography variant="body1" sx={{ color: "#FF0000", fontWeight: 500, mb: 2 }}>{error}</Typography>}

                    <AssetForm
                        categories={props.categories}
                        values={values}
                        onChange={setValues}
                        lockStructure
                        error={error}
                        setError={setError}
                    />

                    <Button
                        disableElevation
                        disabled={updating}
                        onClick={submitUpdate}
                        variant="contained"
                        sx={{ border: 1, borderColor: "marketplace.searchButtonBorder", backgroundColor: "marketplace.viewMoreButtonBackground", color: "navbar.primary", borderRadius: 5, px: 3, py: 1, mt: 4.5, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 1 }}
                    >
                        Update the asset
                        {updating && <CircularProgress size={20} sx={{ color: "#FAFAFA" }} />}
                    </Button>

                    <Box sx={{ mt: 5, border: "1px solid #EF5350", borderRadius: 2.5, p: 2.5 }}>
                        <Typography variant="subtitle1" sx={{ color: "navbar.primary", fontWeight: 500 }}>Delist remaining fractions</Typography>
                        {props.primaryListing && props.primaryListing.quantity > 0 ? (
                            <>
                                <Typography variant="subtitle2" sx={{ color: "assetPurchase.documentRedirectSecondaryText", mt: 1 }}>
                                    {props.primaryListing.quantity} fraction(s) are still for sale on the primary listing. Delisting removes them from the marketplace; sold fractions stay with their owners.
                                </Typography>
                                <Button
                                    onClick={() => { setDelistError(""); setDelistOpen(true); }}
                                    variant="contained"
                                    sx={{ mt: 2.5, backgroundColor: "marketplace.categoryFilter.text", color: "marketplace.filterButtonText", borderRadius: 5, px: 3, py: 1, ":hover": { backgroundColor: "#EF5350", color: "#FFFFFF" } }}
                                >
                                    Delist remaining fractions
                                </Button>
                            </>
                        ) : (
                            <Typography variant="subtitle2" sx={{ color: "assetPurchase.documentRedirectSecondaryText", mt: 1 }}>
                                There is no active primary listing to delist.
                            </Typography>
                        )}
                    </Box>
                </Box>
            </Box>
        </>
    );
}
