"use client";

import { Box, Button, Chip, CircularProgress, Modal, Typography } from "@mui/material";
import { useActiveAccount, useSendAndConfirmTransaction } from "thirdweb/react";
import { prepareContractCall } from "thirdweb";
import { contract, getContractByAddress } from "@/lib/thirdWebClient";
import { createListing } from "@/utils/ABI";
import { getAssetDetail, markAssetMinting } from "@/actions/assets";
import {
    type AssetFormValues,
    buildOnChainMetadata,
    formatUsd,
    pricePerFraction,
    usdcToMicro,
} from "@/components/business/types";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Image from "next/image";

type MintStep =
    | "preview"
    | "minting"
    | "recording"
    | "waiting"
    | "waiting-timeout"
    | "approving"
    | "done";

const STEP_MESSAGES: Record<string, string> = {
    minting: "Confirm the mint transaction in your wallet...",
    recording: "Recording the mint on the platform...",
    waiting: "Minting on chain. This can take a minute...",
    approving: "Approving the marketplace to sell your fractions...",
};

const POLL_INTERVAL_MS = 5000;
const POLL_ATTEMPTS = 36;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Mint and list confirmation modal. Publishing sends mintAndFractionalizeNFT
 * from the user's smart account with the legacy-shaped metadata JSON, records
 * the tx via markAssetMinting, polls getAssetDetail until the indexer flips
 * the asset to active, then sends the primary sale ERC20 approval.
 */
export default function MintModal(props: {
    open: boolean;
    onClose: () => void;
    draftId: string;
    values: AssetFormValues;
    imageUrls: string[];
    documentUrls: Record<string, string[]>;
    categoryName: string;
    businessDisplayName: string;
}) {
    const router = useRouter();
    const wallet = useActiveAccount();
    const { mutateAsync: sendMintTx } = useSendAndConfirmTransaction();
    const { mutateAsync: sendApproveTx } = useSendAndConfirmTransaction();

    const [step, setStep] = useState<MintStep>("preview");
    const [error, setError] = useState("");
    const [erc20Address, setErc20Address] = useState<string | null>(null);

    const busy = step === "minting" || step === "recording" || step === "waiting" || step === "approving";
    const perFraction = pricePerFraction(props.values.valuation, props.values.fractions);

    async function pollUntilActive(): Promise<string | null> {
        for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
            await sleep(POLL_INTERVAL_MS);
            const detail = await getAssetDetail(props.draftId);
            if (detail.ok && detail.data.asset.status === "active" && detail.data.asset.erc20_token_address) {
                return detail.data.asset.erc20_token_address;
            }
        }
        return null;
    }

    async function approveMarketplace(tokenAddress: string) {
        const approveTx = prepareContractCall({
            contract: getContractByAddress(tokenAddress),
            method: "function approve(address spender, uint256 amount) returns (bool)",
            params: [contract.address, BigInt(props.values.fractions)],
        });
        await sendApproveTx(approveTx);
    }

    async function waitAndApprove() {
        setError("");
        setStep("waiting");
        try {
            const tokenAddress = erc20Address ?? (await pollUntilActive());
            if (!tokenAddress) {
                setStep("waiting-timeout");
                return;
            }
            setErc20Address(tokenAddress);
            setStep("approving");
            await approveMarketplace(tokenAddress);
            setStep("done");
        } catch (mintError) {
            setError(mintError instanceof Error ? mintError.message : "Approval failed, please try again");
            setStep("waiting-timeout");
        }
    }

    async function publish() {
        if (!wallet) {
            setError("Please connect your wallet");
            return;
        }
        setError("");
        try {
            setStep("minting");
            const metadata = buildOnChainMetadata(
                props.values,
                props.categoryName,
                props.imageUrls,
                props.documentUrls,
            );
            const transaction = prepareContractCall({
                contract,
                method: createListing,
                params: [
                    BigInt(props.values.fractions),
                    usdcToMicro(props.values.valuation / props.values.fractions),
                    JSON.stringify(metadata),
                ],
            });
            const receipt = await sendMintTx(transaction);

            setStep("recording");
            const marked = await markAssetMinting(props.draftId, receipt.transactionHash);
            if (!marked.ok && marked.error.code !== "conflict") {
                setError(marked.error.message);
                setStep("preview");
                return;
            }

            await waitAndApprove();
        } catch (mintError) {
            setError(mintError instanceof Error ? mintError.message : "Minting failed, please try again");
            setStep("preview");
        }
    }

    const close = () => {
        if (!busy) {
            props.onClose();
        }
    };

    return (
        <Modal open={props.open} onClose={close} aria-labelledby="mint-modal-title">
            {step === "done" ? (
                <Box sx={{ position: { sm: "absolute" }, top: "50%", left: "50%", transform: { sm: "translate(-50%, -50%)" }, bgcolor: "marketplace.background", px: { xs: 3.5, sm: 5, verticalTablet: 12 }, py: 10, width: { xs: "100%", sm: "90%", horizontalTablet: "65%" }, overflowY: "auto", height: { xs: "100%", sm: "auto" }, display: "flex", alignItems: "center", flexDirection: "column" }}>
                    <Image src="/webp/party-popper.webp" width={100} height={100} alt="confirm" />
                    <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h6", sm: "h4" }, color: "navbar.primary", my: { xs: 3, sm: 5 }, textAlign: "center" }}>
                        Asset minted and listed
                    </Typography>
                    <Button onClick={() => router.push("/dashboard")} variant="contained" sx={{ backgroundColor: "marketplace.viewMoreButtonBackground", borderRadius: 5, border: 1, borderColor: "marketplace.searchButtonBorder", py: 1, px: 3, height: "55px", width: { xs: "290px", sm: "344px", verticalTablet: "480px" } }}>
                        <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "subtitle1", horizontalTablet: "h6" }, color: "navbar.primary" }}>Go to dashboard</Typography>
                    </Button>
                </Box>
            ) : step === "waiting-timeout" ? (
                <Box sx={{ position: { sm: "absolute" }, top: "50%", left: "50%", transform: { sm: "translate(-50%, -50%)" }, bgcolor: "marketplace.background", px: { xs: 3.5, sm: 5, verticalTablet: 12 }, py: 10, width: { xs: "100%", sm: "90%", horizontalTablet: "65%" }, overflowY: "auto", height: { xs: "100%", sm: "auto" }, display: "flex", alignItems: "center", flexDirection: "column" }}>
                    <CircularProgress sx={{ color: "#C6FF00", mb: 4 }} />
                    <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h6", sm: "h5" }, color: "navbar.primary", textAlign: "center" }}>
                        Your asset is still minting
                    </Typography>
                    <Typography variant="subtitle1" sx={{ color: "assetPurchase.documentRedirectSecondaryText", mt: 2, textAlign: "center" }}>
                        The transaction was sent. Once the mint is confirmed the asset goes live on the marketplace. You can keep waiting here or check the dashboard later.
                    </Typography>
                    {error && <Typography variant="subtitle2" sx={{ color: "red", mt: 2, textAlign: "center" }}>{error}</Typography>}
                    <Box sx={{ display: "flex", gap: 2, mt: 5, flexWrap: "wrap", justifyContent: "center" }}>
                        <Button onClick={waitAndApprove} variant="contained" sx={{ backgroundColor: "marketplace.viewMoreButtonBackground", borderRadius: 5, border: 1, borderColor: "marketplace.searchButtonBorder", py: 1, px: 4, color: "navbar.primary" }}>
                            {erc20Address ? "Retry approval" : "Check again"}
                        </Button>
                        <Button onClick={() => router.push("/dashboard")} variant="contained" sx={{ backgroundColor: "marketplace.categoryFilter.text", borderRadius: 5, py: 1, px: 4, color: "marketplace.filterButtonText" }}>
                            Go to dashboard
                        </Button>
                    </Box>
                </Box>
            ) : (
                <Box id="mint-modal" sx={{ position: { sm: "absolute" }, top: "50%", left: "50%", transform: { sm: "translate(-50%, -50%)" }, bgcolor: "marketplace.background", p: { xs: 3.5, sm: 5, verticalTablet: 7.5 }, pt: 4, width: { xs: "100%", sm: "90%", horizontalTablet: "65%" }, overflowY: "auto", height: { xs: "100%", sm: "80%" } }}>
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <Box>
                            <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h6", sm: "h5" }, color: "assetPurchase.modal.heading" }}>Check the publication</Typography>
                            {error && <Typography variant="subtitle2" sx={{ color: "red" }}>{error}</Typography>}
                        </Box>
                        <svg onClick={close} style={{ cursor: "pointer" }} width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M15.9996 2.00009L1.85742 16.1422M15.9996 16.1421L1.85742 2" stroke="#9E9E9E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </Box>
                    <Box sx={{ display: "flex", gap: 4, mt: { xs: 2.5, sm: 4 }, flexDirection: { xs: "column", sm: "row" } }}>
                        <Box sx={{ flex: 1 }}>
                            {props.imageUrls.length > 0 && (
                                <Image src={props.imageUrls[0]} alt={props.values.title} width={0} height={0} sizes="100vw" style={{ width: "100%", height: "290px", objectFit: "cover", borderRadius: 8 }} />
                            )}
                            {props.imageUrls.length > 1 && (
                                <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap" }}>
                                    {props.imageUrls.slice(1).map((url, index) => (
                                        <Image key={index} src={url} alt="" width={0} height={0} sizes="100vw" style={{ width: "72px", height: "72px", objectFit: "cover", borderRadius: 6 }} />
                                    ))}
                                </Box>
                            )}
                            <Box sx={{ mt: 2, backgroundColor: "assetPurchase.documentRedirectBackground", border: 1, borderColor: "assetPurchase.documentRedirectBorder", borderRadius: 1, py: 1.5, px: 2 }}>
                                <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "subtitle2", horizontalTablet: "subtitle1" }, color: "navbar.primary" }}>Documents confirming ownership</Typography>
                                <Typography variant="subtitle2" sx={{ color: "assetPurchase.documentRedirectSecondaryText" }}>
                                    {Object.values(props.documentUrls).reduce((count, urls) => count + urls.length, 0)} document(s) attached
                                </Typography>
                            </Box>
                        </Box>
                        <Box sx={{ flex: 1 }}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
                                <Chip sx={{ color: "marketplace.filterButtonText", border: 1, borderColor: "border", fontFamily: "Roboto", py: 1, px: 2.5, flexGrow: 1 }} label={props.businessDisplayName} />
                                <Chip sx={{ color: "marketplace.filterButtonText", border: 1, borderColor: "border", fontFamily: "Roboto", py: 1, px: 2.5, flexGrow: 1 }} label={props.categoryName} />
                            </Box>
                            <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h6", sm: "h5" }, py: 3, color: "navbar.primary" }}>{props.values.title}</Typography>
                            <Typography variant="subtitle1" sx={{ color: "assetPurchase.documentRedirectSecondaryText" }}>{props.values.description}</Typography>
                            <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "subtitle1", sm: "h6" }, color: "listingCard.buttonText", mt: 3 }}>Info</Typography>
                            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 3, borderBottom: 1, borderBottomColor: "assetPurchase.documentRedirectBorder", pb: 0.5 }}>
                                <Typography variant="body1" sx={{ color: "marketplace.filterButtonText" }}>Amounts of Fractions</Typography>
                                <Typography variant="body1" sx={{ color: "navbar.primary", fontWeight: 500 }}>{props.values.fractions}</Typography>
                            </Box>
                            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 2, borderBottom: 1, borderBottomColor: "assetPurchase.documentRedirectBorder", pb: 0.5 }}>
                                <Typography variant="body1" sx={{ color: "marketplace.filterButtonText" }}>Property Value</Typography>
                                <Typography variant="subtitle1" sx={{ color: "navbar.primary", fontWeight: 500 }}>{formatUsd(props.values.valuation)}</Typography>
                            </Box>
                            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 2, borderBottom: 1, borderBottomColor: "assetPurchase.documentRedirectBorder", pb: 0.5 }}>
                                <Typography variant="body1" sx={{ color: "marketplace.filterButtonText" }}>Price per Fraction</Typography>
                                <Typography variant="subtitle1" sx={{ color: "navbar.primary", fontWeight: 500 }}>{formatUsd(perFraction)}</Typography>
                            </Box>
                        </Box>
                    </Box>
                    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", mt: 5, gap: 2 }}>
                        {busy && (
                            <Typography variant="subtitle2" sx={{ color: "assetPurchase.documentRedirectSecondaryText" }}>
                                {STEP_MESSAGES[step]}
                            </Typography>
                        )}
                        <Button
                            disabled={busy}
                            endIcon={busy && <CircularProgress size={20} sx={{ color: "navbar.primary" }} />}
                            onClick={publish}
                            variant="contained"
                            sx={{ backgroundColor: "marketplace.viewMoreButtonBackground", borderRadius: 5, border: 1, borderColor: "marketplace.searchButtonBorder", py: 1, px: 3, height: "55px", width: { xs: "290px", sm: "344px", verticalTablet: "480px" } }}
                        >
                            <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "subtitle1", horizontalTablet: "h6" }, color: "navbar.primary" }}>Publish Asset</Typography>
                        </Button>
                    </Box>
                </Box>
            )}
        </Modal>
    );
}
