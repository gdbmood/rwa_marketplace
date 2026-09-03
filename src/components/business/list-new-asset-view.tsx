"use client";

import { Box, Button, CircularProgress, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import AssetForm from "@/components/business/asset-form";
import MintModal from "@/components/business/mint-modal";
import { resolveDocumentUploads, resolveUploads } from "@/components/business/upload-client";
import {
    type AssetFormValues,
    type CategoryDto,
    buildOnChainMetadata,
    emptyFormValues,
    pricePerFraction,
    validateAssetValues,
} from "@/components/business/types";
import { createDraftAsset, updateDraftAsset } from "@/actions/assets";
import type { Json } from "@/types/database";

export interface DraftSeed {
    id: string;
    values: AssetFormValues;
}

/**
 * Draft-first listing flow: save or resume a draft (visible as Coming soon),
 * then mint and list through the confirmation modal.
 */
export default function ListNewAssetView(props: {
    categories: CategoryDto[];
    initialDraft: DraftSeed | null;
    businessDisplayName: string;
}) {
    const { categories } = props;

    const [values, setValues] = useState<AssetFormValues>(() =>
        props.initialDraft ? props.initialDraft.values : emptyFormValues(categories[0]),
    );
    const [draftId, setDraftId] = useState<string | null>(props.initialDraft?.id ?? null);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [saving, setSaving] = useState(false);
    const [preparingMint, setPreparingMint] = useState(false);
    const [mintOpen, setMintOpen] = useState(false);
    const [mintMedia, setMintMedia] = useState<{
        imageUrls: string[];
        documentUrls: Record<string, string[]>;
    } | null>(null);

    useEffect(() => {
        if (error.trim().length > 0) {
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    }, [error]);

    const category = categories.find((c) => c.id === values.categoryId) ?? categories[0];

    async function persistDraft(): Promise<{ id: string; imageUrls: string[]; documentUrls: Record<string, string[]> } | null> {
        const imageUrls = await resolveUploads(values.images, "image");
        const documentUrls = await resolveDocumentUploads(values.documents);
        setValues((current) => ({ ...current, images: imageUrls, documents: documentUrls }));

        const metadata = buildOnChainMetadata(values, category.name, imageUrls, documentUrls) as Json;
        const input = {
            categoryId: values.categoryId,
            name: values.title,
            description: values.description || null,
            metadata,
            totalSupply: values.fractions > 0 ? values.fractions : null,
            valuation: values.valuation > 0 ? values.valuation : null,
            mintPricePerFraction:
                values.valuation > 0 && values.fractions > 0
                    ? pricePerFraction(values.valuation, values.fractions)
                    : null,
            kycRequired: values.kycRequired,
        };

        const result = draftId
            ? await updateDraftAsset(draftId, input)
            : await createDraftAsset(input);
        if (!result.ok) {
            setError(result.error.message);
            return null;
        }
        setDraftId(result.data.id);
        return { id: result.data.id, imageUrls, documentUrls };
    }

    async function saveDraft() {
        setError("");
        setNotice("");
        if (!values.title.trim()) {
            setError("A title is required to save a draft");
            return;
        }
        setSaving(true);
        try {
            const saved = await persistDraft();
            if (saved) {
                setNotice("Draft saved. It shows on the marketplace as Coming soon until you mint it.");
            }
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "Could not save the draft, please try again");
        } finally {
            setSaving(false);
        }
    }

    async function openMintPreview() {
        setError("");
        setNotice("");
        const validationError = validateAssetValues(values, category);
        if (validationError) {
            setError(validationError);
            return;
        }
        if (!props.businessDisplayName.trim()) {
            setError("Please complete your profile before listing an asset");
            return;
        }
        setPreparingMint(true);
        try {
            const saved = await persistDraft();
            if (!saved) {
                return;
            }
            setMintMedia({ imageUrls: saved.imageUrls, documentUrls: saved.documentUrls });
            setMintOpen(true);
        } catch (mintError) {
            setError(mintError instanceof Error ? mintError.message : "Could not prepare the mint, please try again");
        } finally {
            setPreparingMint(false);
        }
    }

    if (categories.length === 0) {
        return (
            <Box sx={{ flexGrow: 1, display: "flex", justifyContent: "center", alignItems: "center", py: 12 }}>
                <Typography variant="subtitle1" sx={{ color: "marketplace.filterButtonText" }}>
                    No asset categories are available yet. Please try again later.
                </Typography>
            </Box>
        );
    }

    return (
        <>
            {draftId && mintMedia && (
                <MintModal
                    open={mintOpen}
                    onClose={() => setMintOpen(false)}
                    draftId={draftId}
                    values={values}
                    imageUrls={mintMedia.imageUrls}
                    documentUrls={mintMedia.documentUrls}
                    categoryName={category.name}
                    businessDisplayName={props.businessDisplayName}
                />
            )}
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
                        {draftId ? "Edit Draft Asset" : "List New Asset"}
                    </Typography>
                    {error && <Typography data-testid="listing-form-error" variant="body1" sx={{ color: "#FF0000", fontWeight: 500, mb: 2 }}>{error}</Typography>}
                    {notice && <Typography data-testid="listing-form-notice" variant="body1" sx={{ color: "#C6FF00", fontWeight: 500, mb: 2 }}>{notice}</Typography>}

                    <AssetForm
                        categories={categories}
                        values={values}
                        onChange={(next) => { setNotice(""); setValues(next); }}
                        error={error}
                        setError={setError}
                    />

                    <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 2, mt: 4.5 }}>
                        <Button
                            disableElevation
                            disabled={saving || preparingMint}
                            onClick={saveDraft}
                            variant="contained"
                            sx={{ border: 1, borderColor: "border", backgroundColor: "marketplace.categoryFilter.text", color: "marketplace.filterButtonText", borderRadius: 5, px: 3, py: 1, flexGrow: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 1 }}
                        >
                            Save Draft
                            {saving && <CircularProgress size={20} sx={{ color: "marketplace.filterButtonText" }} />}
                        </Button>
                        <Button
                            disableElevation
                            disabled={saving || preparingMint}
                            onClick={openMintPreview}
                            variant="contained"
                            sx={{ border: 1, borderColor: "marketplace.searchButtonBorder", backgroundColor: "marketplace.viewMoreButtonBackground", color: "navbar.primary", borderRadius: 5, px: 3, py: 1, flexGrow: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 1 }}
                        >
                            Mint &amp; List Preview
                            {preparingMint && <CircularProgress size={20} sx={{ color: "#FAFAFA" }} />}
                        </Button>
                    </Box>
                </Box>
            </Box>
        </>
    );
}
