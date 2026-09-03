import 'server-only';

/**
 * Server-side data loader for the investor portfolio page. All reads go
 * through the repository layer (or the v_marketplace read model, service
 * client) and are scoped to the session user's id; the page itself calls
 * requireUser() before invoking this.
 */

import type { UserRow } from '@/lib/db/users';
import { getHoldingsForUser } from '@/lib/db/holdings';
import { getListingsByLister } from '@/lib/db/listings';
import { listTransactionsForUser } from '@/lib/db/transactions';
import { createServiceClient } from '@/lib/supabase/server';
import { type ViewRow, unwrap } from '@/lib/db/helpers';
import { parseNumeric } from '@/lib/db/numeric';
import { metadataImageUrls } from '@/components/investor/format';
import type {
  PortfolioData,
  PortfolioHoldingDto,
  PortfolioListingDto,
  PortfolioTransactionDto,
} from '@/components/portfolio/types';

type MarketplaceRow = ViewRow<'v_marketplace'>;

async function getMarketplaceRows(assetIds: string[]): Promise<MarketplaceRow[]> {
  if (assetIds.length === 0) {
    return [];
  }
  const db = createServiceClient();
  const result = await db.from('v_marketplace').select('*').in('asset_id', assetIds);
  return unwrap(result, 'portfolio.getMarketplaceRows');
}

/** Everything the portfolio page renders, scoped to the calling investor. */
export async function loadPortfolio(user: UserRow): Promise<PortfolioData> {
  const [holdings, listings, transactions] = await Promise.all([
    getHoldingsForUser(user.id),
    getListingsByLister(user.id),
    listTransactionsForUser(user.id),
  ]);

  const assetIds = new Set<string>();
  for (const holding of holdings) {
    if (holding.asset_id) {
      assetIds.add(holding.asset_id);
    }
  }
  for (const tx of transactions) {
    if (tx.asset_id) {
      assetIds.add(tx.asset_id);
    }
  }

  const marketRows = await getMarketplaceRows(Array.from(assetIds));
  const marketByAsset = new Map(
    marketRows.filter((row) => row.asset_id).map((row) => [row.asset_id as string, row]),
  );

  const openListingsByAsset = new Map<string, PortfolioListingDto[]>();
  for (const listing of listings) {
    if (listing.status !== 'active') {
      continue;
    }
    const dto: PortfolioListingDto = {
      id: listing.id,
      assetId: listing.asset_id,
      quantity: listing.quantity,
      pricePerFraction: parseNumeric(listing.price_per_fraction) ?? 0,
      kind: listing.kind,
      createdAt: listing.created_at,
    };
    const existing = openListingsByAsset.get(listing.asset_id);
    if (existing) {
      existing.push(dto);
    } else {
      openListingsByAsset.set(listing.asset_id, [dto]);
    }
  }

  const holdingDtos: PortfolioHoldingDto[] = [];
  for (const holding of holdings) {
    if (!holding.asset_id) {
      continue;
    }
    const quantity = holding.quantity ?? 0;
    const locked = holding.locked_quantity ?? 0;
    if (quantity <= 0 && locked <= 0) {
      continue;
    }
    const market = marketByAsset.get(holding.asset_id);
    holdingDtos.push({
      assetId: holding.asset_id,
      assetName: holding.asset_name ?? market?.name ?? 'Untitled asset',
      assetStatus: holding.asset_status ?? 'active',
      categoryName: market?.category_name ?? null,
      businessDisplayName: market?.business_display_name ?? null,
      imageUrl: metadataImageUrls(holding.metadata ?? market?.metadata)[0] ?? null,
      nftId: holding.nft_id,
      erc20TokenAddress: holding.erc20_token_address,
      quantity,
      lockedQuantity: locked,
      totalSupply: holding.total_supply,
      averageEntryPrice: parseNumericSafe(holding.average_entry_price),
      floorPrice: parseNumericSafe(
        market?.floor_price_per_fraction ?? market?.mint_price_per_fraction,
      ),
      openListings: openListingsByAsset.get(holding.asset_id) ?? [],
      updatedAt: holding.holding_updated_at,
    });
  }
  holdingDtos.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));

  const transactionDtos: PortfolioTransactionDto[] = transactions.map((tx) => {
    const market = tx.asset_id ? marketByAsset.get(tx.asset_id) : undefined;
    return {
      id: tx.id,
      type: tx.type,
      direction: tx.from_user_id === user.id ? 'out' : 'in',
      assetName: market?.name ?? (tx.asset_id ? 'Unknown asset' : '-'),
      categoryName: market?.category_name ?? null,
      quantity: tx.quantity,
      pricePerFraction: parseNumericSafe(tx.price_per_fraction),
      total: parseNumericSafe(tx.total),
      txHash: tx.tx_hash,
      createdAt: tx.created_at,
    };
  });

  return { holdings: holdingDtos, transactions: transactionDtos };
}

function parseNumericSafe(value: string | number | null | undefined): number | null {
  try {
    return parseNumeric(value);
  } catch {
    return null;
  }
}
