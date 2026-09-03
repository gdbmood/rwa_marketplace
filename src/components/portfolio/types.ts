/**
 * Client-safe DTOs for the investor portfolio. Built server side (see
 * src/components/portfolio/server.ts) from v_portfolio, the caller's
 * listings and the transactions ledger; all money values are parsed into
 * plain numbers for display (USDC units).
 */

import type { Database } from '@/types/database';

export type PortfolioTxType = Database['public']['Enums']['tx_type'];
export type PortfolioAssetStatus = Database['public']['Enums']['asset_status'];

export interface PortfolioListingDto {
  id: string;
  assetId: string;
  quantity: number;
  /** Price per fraction in USDC units. */
  pricePerFraction: number;
  kind: 'primary' | 'secondary';
  createdAt: string;
}

export interface PortfolioHoldingDto {
  assetId: string;
  assetName: string;
  assetStatus: PortfolioAssetStatus;
  categoryName: string | null;
  businessDisplayName: string | null;
  imageUrl: string | null;
  nftId: number | null;
  erc20TokenAddress: string | null;
  quantity: number;
  lockedQuantity: number;
  totalSupply: number | null;
  /** Weighted average entry price per fraction, USDC units. */
  averageEntryPrice: number | null;
  /** Cheapest active listing price for the asset right now, USDC units. */
  floorPrice: number | null;
  /** The caller's own open listings on this asset. */
  openListings: PortfolioListingDto[];
  updatedAt: string | null;
}

export interface PortfolioTransactionDto {
  id: string;
  type: PortfolioTxType;
  /** Whether the caller was the sender or the receiver of this entry. */
  direction: 'in' | 'out';
  assetName: string;
  categoryName: string | null;
  quantity: number | null;
  pricePerFraction: number | null;
  total: number | null;
  txHash: string | null;
  createdAt: string;
}

export interface PortfolioData {
  holdings: PortfolioHoldingDto[];
  transactions: PortfolioTransactionDto[];
}

/** Display label for a ledger entry, from the caller's point of view. */
export function transactionLabel(tx: PortfolioTransactionDto): string {
  switch (tx.type) {
    case 'buy':
      return tx.direction === 'in' ? 'Purchase' : 'Sale';
    case 'sell_list':
      return 'Listed';
    case 'unlist':
      return 'Unlisted';
    case 'price_update':
      return 'Price update';
    case 'transfer':
      return tx.direction === 'in' ? 'Received' : 'Sent';
    case 'onramp':
      return 'Card deposit';
    case 'mint':
      return 'Mint';
    default:
      return tx.type;
  }
}
