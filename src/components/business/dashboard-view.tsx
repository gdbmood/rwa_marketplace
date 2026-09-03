"use client";

import { Box, Button, Chip, CircularProgress, Container, Divider, Typography } from "@mui/material";
import TableCell, { tableCellClasses } from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import Table from "@mui/material/Table";
import { styled, type PaletteOptions } from "@mui/material/styles";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
    ASSET_STATUS_LABELS,
    type BusinessAssetDto,
    type BusinessAssetStatus,
    type BusinessTransactionDto,
    formatUsd,
    shortenAddress,
} from "@/components/business/types";

// The custom palette sections (marketplace, portfolio) are declared on
// PaletteOptions in src/theme.ts but not on Palette, so the runtime palette
// is read through the options type.
const appPalette = (theme: { palette: unknown }) =>
    theme.palette as PaletteOptions;

const StyledTableCell = styled(TableCell)(({ theme }) => ({
    [`&.${tableCellClasses.head}`]: {
        fontFamily: "Roboto",
        backgroundColor: appPalette(theme).marketplace?.background,
        color: appPalette(theme).portfolio?.tableText,
        borderColor: "rgba(255, 255, 255, 0.12)",
        fontWeight: 500,
        fontSize: 14,
    },
    [`&.${tableCellClasses.body}`]: {
        fontSize: 14,
        color: appPalette(theme).portfolio?.tableText,
        borderColor: "rgba(255, 255, 255, 0.12)",
    },
}));

const StyledTableRow = styled(TableRow)(({ theme }) => ({
    "&:nth-of-type(odd)": {
        backgroundColor: appPalette(theme).portfolio?.tableOddRow,
    },
    "&:nth-of-type(even)": {
        backgroundColor: appPalette(theme).portfolio?.tableEvenRow,
    },
}));

const FILTERS: { label: string; status: BusinessAssetStatus | null }[] = [
    { label: "All", status: null },
    { label: "Coming soon", status: "draft" },
    { label: "Minting", status: "minting" },
    { label: "Listed", status: "active" },
    { label: "Sold out", status: "sold_out" },
    { label: "Delisted", status: "delisted" },
];

const TX_TYPE_LABELS: Record<string, string> = {
    mint: "Mint",
    buy: "Sale",
    sell_list: "Listed",
    unlist: "Delisted",
    price_update: "Price update",
    transfer: "Transfer",
    onramp: "On-ramp",
};

function explorerTxUrl(txHash: string): string {
    return `${process.env.NEXT_PUBLIC_BLOCKCHAIN_EXPLORER_URL}/tx/${txHash}`;
}

function statusChipColors(status: BusinessAssetStatus): { bg: string; fg: string } {
    switch (status) {
        case "active":
            return { bg: "#C6FF00", fg: "#000000" };
        case "minting":
            return { bg: "#424242", fg: "#FAFAFA" };
        case "sold_out":
            return { bg: "#212121", fg: "#C6FF00" };
        case "delisted":
            return { bg: "#212121", fg: "#EF5350" };
        default:
            return { bg: "#212121", fg: "#BDBDBD" };
    }
}

function AssetCard(props: { asset: BusinessAssetDto }) {
    const { asset } = props;
    const colors = statusChipColors(asset.status);
    const manageHref = `/asset/${asset.nftId ?? asset.id}/update`;

    return (
        <Box sx={{ width: { xs: "100%", sm: "300px" }, backgroundColor: "navbar.background", border: 1, borderColor: "border", borderRadius: "10px", overflow: "hidden" }}>
            <Box sx={{ position: "relative", height: "170px", backgroundColor: "#212121" }}>
                {asset.imageUrl ? (
                    <Image src={asset.imageUrl} alt={asset.name} fill sizes="300px" style={{ objectFit: "cover" }} />
                ) : (
                    <Box sx={{ height: "100%", display: "flex", justifyContent: "center", alignItems: "center" }}>
                        <Typography variant="subtitle2" sx={{ color: "#757575" }}>No image yet</Typography>
                    </Box>
                )}
                <Chip
                    size="small"
                    icon={asset.status === "minting" ? <CircularProgress size={12} sx={{ color: colors.fg, ml: 1 }} /> : undefined}
                    label={ASSET_STATUS_LABELS[asset.status]}
                    sx={{ position: "absolute", top: 10, right: 10, backgroundColor: colors.bg, color: colors.fg, fontWeight: 500 }}
                />
            </Box>
            <Box sx={{ p: 2 }}>
                <Typography variant="subtitle1" sx={{ color: "navbar.primary", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {asset.name}
                </Typography>
                <Typography variant="subtitle2" sx={{ color: "portfolio.secondaryText" }}>{asset.categoryName}</Typography>
                <Box sx={{ display: "flex", justifyContent: "space-between", mt: 1.5 }}>
                    <Typography variant="body2" sx={{ color: "marketplace.filterButtonText" }}>Valuation</Typography>
                    <Typography variant="body2" sx={{ color: "navbar.primary", fontWeight: 500 }}>{formatUsd(asset.valuation)}</Typography>
                </Box>
                <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.5 }}>
                    <Typography variant="body2" sx={{ color: "marketplace.filterButtonText" }}>Fractions sold</Typography>
                    <Typography variant="body2" sx={{ color: "navbar.primary", fontWeight: 500 }}>
                        {asset.unitsSold}{asset.totalSupply ? ` / ${asset.totalSupply}` : ""}
                    </Typography>
                </Box>
                <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.5 }}>
                    <Typography variant="body2" sx={{ color: "marketplace.filterButtonText" }}>Raised</Typography>
                    <Typography variant="body2" sx={{ color: "navbar.primary", fontWeight: 500 }}>{formatUsd(asset.grossRevenue)}</Typography>
                </Box>
                <Box sx={{ mt: 2, display: "flex", gap: 1 }}>
                    {asset.status === "draft" && (
                        <Button component={Link} href={`/list-new-asset?draft=${asset.id}`} fullWidth variant="contained" sx={{ backgroundColor: "marketplace.viewMoreButtonBackground", border: 1, borderColor: "marketplace.searchButtonBorder", color: "navbar.primary", borderRadius: 5, py: 0.5 }}>
                            Edit draft
                        </Button>
                    )}
                    {asset.status === "active" && (
                        <Button component={Link} href={manageHref} fullWidth variant="contained" sx={{ backgroundColor: "marketplace.viewMoreButtonBackground", border: 1, borderColor: "marketplace.searchButtonBorder", color: "navbar.primary", borderRadius: 5, py: 0.5 }}>
                            Manage listing
                        </Button>
                    )}
                    {asset.status === "minting" && (
                        <Typography variant="body2" sx={{ color: "portfolio.secondaryText", width: "100%", textAlign: "center", py: 0.5 }}>
                            Waiting for on-chain confirmation
                        </Typography>
                    )}
                </Box>
            </Box>
        </Box>
    );
}

/** Business dashboard: assets in every status, sales metrics, transactions. */
export default function DashboardView(props: {
    assets: BusinessAssetDto[];
    transactions: BusinessTransactionDto[];
}) {
    const { assets, transactions } = props;

    const [selectedFilter, setSelectedFilter] = useState(0);
    const [assetRowsShown, setAssetRowsShown] = useState(10);
    const [txRowsShown, setTxRowsShown] = useState(10);

    const filter = FILTERS[selectedFilter];
    const visibleAssets = filter.status ? assets.filter((a) => a.status === filter.status) : assets;

    const totalRaised = assets.reduce((acc, a) => acc + a.grossRevenue, 0);
    const totalSold = assets.reduce((acc, a) => acc + a.unitsSold, 0);
    const totalBuyers = assets.reduce((acc, a) => acc + a.buyerCount, 0);

    return (
        <Container sx={{ flexGrow: 1 }}>
            <Typography variant="subtitle2" sx={{ color: "navbar.primary", fontWeight: 500, mt: 5 }}>Overview of tokenized assets</Typography>
            <Divider sx={{ borderColor: "marketplace.categoryFilter.background" }} />
            <Typography variant="h5" sx={{ color: "navbar.primary", fontWeight: 500, mt: 5 }}>Summary Metrics</Typography>

            <Box sx={{ mt: 3, display: "flex", justifyContent: { sm: "center" }, gap: 1, flexWrap: "wrap" }}>
                {[
                    { value: `${assets.length}`, label: "Total Assets" },
                    { value: formatUsd(totalRaised), label: "Total Raised Funds" },
                    { value: `${totalSold}`, label: "Fractions Sold" },
                    { value: `${totalBuyers}`, label: "Unique Buyers" },
                ].map((metric, index) => (
                    <Box key={index} sx={{ py: { xs: 3, sm: 4 }, borderRadius: "10px", px: { xs: 1.5, sm: 3 }, backgroundColor: "navbar.background", border: 1, borderColor: "border", flexGrow: 1 }}>
                        <Typography style={{ fontWeight: 700 }} sx={{ typography: { xs: "subtitle1", sm: "h6", horizontalTablet: "h5" }, color: "navbar.primary" }}>{metric.value}</Typography>
                        <Typography sx={{ typography: { xs: "subtitle2", sm: "h6" }, color: "portfolio.secondaryText" }}>{metric.label}</Typography>
                    </Box>
                ))}
            </Box>

            <Box sx={{ display: "flex", mt: 5, gap: 1, flexWrap: "wrap", alignItems: "center" }}>
                <Typography variant="subtitle1" sx={{ color: "navbar.primary" }}>Filter</Typography>
                {FILTERS.map((option, index) => (
                    <Chip key={option.label} label={option.label} sx={{
                        flexGrow: { xs: 1, sm: 0 },
                        backgroundColor: selectedFilter === index ? "marketplace.categoryFilter.background" : "navbar.background",
                        border: selectedFilter === index ? "" : 1,
                        borderColor: selectedFilter === index ? "" : "border",
                        color: selectedFilter === index ? "marketplace.categoryFilter.text" : "marketplace.filterButtonText",
                        "&:hover": {
                            backgroundColor: selectedFilter === index ? "marketplace.categoryFilter.background" : "navbar.background",
                        },
                    }}
                        onClick={() => setSelectedFilter(index)} />
                ))}
            </Box>

            {assets.length === 0 ? (
                <Box sx={{ mt: 6, py: 8, textAlign: "center", border: "1px dashed #424242", borderRadius: "10px" }}>
                    <Typography variant="h6" sx={{ color: "navbar.primary", fontWeight: 500 }}>No assets yet</Typography>
                    <Typography variant="subtitle1" sx={{ color: "portfolio.secondaryText", mt: 1 }}>
                        Create your first listing to start raising funds.
                    </Typography>
                    <Button component={Link} href="/list-new-asset" variant="contained" sx={{ mt: 3, backgroundColor: "marketplace.viewMoreButtonBackground", border: 1, borderColor: "marketplace.searchButtonBorder", color: "navbar.primary", borderRadius: 5, px: 4, py: 1 }}>
                        List a new asset
                    </Button>
                </Box>
            ) : visibleAssets.length === 0 ? (
                <Box sx={{ mt: 6, py: 6, textAlign: "center" }}>
                    <Typography variant="subtitle1" sx={{ color: "portfolio.secondaryText" }}>
                        No assets with the status {filter.label}.
                    </Typography>
                </Box>
            ) : (
                <Box sx={{ mt: { xs: 3, sm: 5 }, display: "flex", flexWrap: "wrap", gap: { xs: 1, sm: 2.5 } }}>
                    {visibleAssets.map((asset) => (
                        <AssetCard key={asset.id} asset={asset} />
                    ))}
                </Box>
            )}

            {assets.length > 0 && (
                <>
                    <Typography variant="h5" sx={{ mt: 6, fontWeight: 500, color: "navbar.primary" }}>Asset Listing Table (Detailed Breakdown per Asset)</Typography>
                    <TableContainer sx={{ mt: 3.5 }}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <StyledTableCell>Created On</StyledTableCell>
                                    <StyledTableCell>Asset Name</StyledTableCell>
                                    <StyledTableCell>Category</StyledTableCell>
                                    <StyledTableCell>Status</StyledTableCell>
                                    <StyledTableCell>Total Raised</StyledTableCell>
                                    <StyledTableCell>Funding Goal</StyledTableCell>
                                    <StyledTableCell>Fractions Sold</StyledTableCell>
                                    <StyledTableCell>Buyers</StyledTableCell>
                                    <StyledTableCell>Blockchain Tx</StyledTableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {visibleAssets.slice(0, assetRowsShown).map((row) => (
                                    <StyledTableRow key={row.id}>
                                        <StyledTableCell component="th" scope="row">{new Date(row.createdAt).toLocaleDateString()}</StyledTableCell>
                                        <StyledTableCell>{row.name}</StyledTableCell>
                                        <StyledTableCell>{row.categoryName}</StyledTableCell>
                                        <StyledTableCell>{ASSET_STATUS_LABELS[row.status]}</StyledTableCell>
                                        <StyledTableCell>{formatUsd(row.grossRevenue)}</StyledTableCell>
                                        <StyledTableCell>{formatUsd(row.valuation)}</StyledTableCell>
                                        <StyledTableCell>
                                            {row.totalSupply ? `${Math.round((row.unitsSold / row.totalSupply) * 100)}%` : "-"}
                                        </StyledTableCell>
                                        <StyledTableCell>{row.buyerCount}</StyledTableCell>
                                        <StyledTableCell>
                                            {row.mintTxHash ? (
                                                <Link href={explorerTxUrl(row.mintTxHash)} target="_blank" style={{ color: "#C6FF00" }}>
                                                    View
                                                </Link>
                                            ) : "-"}
                                        </StyledTableCell>
                                    </StyledTableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                    {visibleAssets.length > assetRowsShown && (
                        <Box onClick={() => setAssetRowsShown(assetRowsShown + 5)} sx={{ display: "flex", justifyContent: "center", mt: 4, alignItems: "center" }}>
                            <Button variant="contained" sx={{ backgroundColor: "#424242", color: "#FFFFFF", borderRadius: 5, px: 3, py: 1, fontFamily: "Roboto" }}>View More</Button>
                        </Box>
                    )}
                </>
            )}

            <Typography variant="h5" sx={{ mt: 6, fontWeight: 500, color: "navbar.primary" }}>Transactions</Typography>
            {transactions.length === 0 ? (
                <Box sx={{ mt: 3, py: 6, textAlign: "center", border: "1px dashed #424242", borderRadius: "10px" }}>
                    <Typography variant="subtitle1" sx={{ color: "portfolio.secondaryText" }}>
                        No transactions yet. Sales and listing activity show up here.
                    </Typography>
                </Box>
            ) : (
                <>
                    <TableContainer sx={{ mt: 3 }}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <StyledTableCell>Type</StyledTableCell>
                                    <StyledTableCell>Date</StyledTableCell>
                                    <StyledTableCell>Asset</StyledTableCell>
                                    <StyledTableCell>Quantity</StyledTableCell>
                                    <StyledTableCell>Price / Fraction</StyledTableCell>
                                    <StyledTableCell>Total</StyledTableCell>
                                    <StyledTableCell>Counterparty</StyledTableCell>
                                    <StyledTableCell>Tx</StyledTableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {transactions.slice(0, txRowsShown).map((tx) => (
                                    <StyledTableRow key={tx.id}>
                                        <StyledTableCell component="th" scope="row">{TX_TYPE_LABELS[tx.type] ?? tx.type}</StyledTableCell>
                                        <StyledTableCell>{new Date(tx.createdAt).toLocaleString()}</StyledTableCell>
                                        <StyledTableCell>{tx.assetName}</StyledTableCell>
                                        <StyledTableCell>{tx.quantity ?? "-"}</StyledTableCell>
                                        <StyledTableCell>{tx.pricePerFraction !== null ? formatUsd(tx.pricePerFraction) : "-"}</StyledTableCell>
                                        <StyledTableCell>{tx.total !== null ? formatUsd(tx.total) : "-"}</StyledTableCell>
                                        <StyledTableCell>{shortenAddress(tx.counterpartyWallet)}</StyledTableCell>
                                        <StyledTableCell>
                                            {tx.txHash ? (
                                                <Link href={explorerTxUrl(tx.txHash)} target="_blank" style={{ color: "#C6FF00" }}>
                                                    View
                                                </Link>
                                            ) : "-"}
                                        </StyledTableCell>
                                    </StyledTableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                    {transactions.length > txRowsShown && (
                        <Box onClick={() => setTxRowsShown(txRowsShown + 10)} sx={{ display: "flex", justifyContent: "center", mt: 4, alignItems: "center" }}>
                            <Button variant="contained" sx={{ backgroundColor: "#424242", color: "#FFFFFF", borderRadius: 5, px: 3, py: 1, fontFamily: "Roboto" }}>View More</Button>
                        </Box>
                    )}
                </>
            )}
            <Box sx={{ mb: 9 }} />
        </Container>
    );
}
