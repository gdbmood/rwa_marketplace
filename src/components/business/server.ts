import 'server-only';

/**
 * Server-side gate and data loaders for the business pages. Reads go through
 * the repository layer (or, for read models, the same service client pattern
 * the actions use) and are always filtered by the session user's id.
 */

import { getSessionWallet } from '@/lib/auth/session';
import { getUserByWallet, type UserRow } from '@/lib/db/users';
import { listCategories } from '@/lib/db/categories';
import { listAssetsByBusiness, type AssetRow } from '@/lib/db/assets';
import { listTransactionsForUser } from '@/lib/db/transactions';
import { createServiceClient } from '@/lib/supabase/server';
import { type ViewRow, unwrap } from '@/lib/db/helpers';
import { parseNumeric } from '@/lib/db/numeric';
import {
  type AssetFormValues,
  type BusinessAssetDto,
  type BusinessProfileDto,
  type BusinessSettingsDto,
  type BusinessTransactionDto,
  type CategoryDto,
  defaultDynamicValues,
  parseAssetMetadata,
  parseCategoryFields,
} from '@/components/business/types';

export type BusinessGate =
  | { status: 'unauthenticated' }
  | { status: 'not_business' }
  | { status: 'unverified'; user: UserRow }
  | { status: 'ok'; user: UserRow };

/** Resolves the session into a business access decision for server pages. */
export async function getBusinessGate(): Promise<BusinessGate> {
  const wallet = await getSessionWallet();
  if (!wallet) {
    return { status: 'unauthenticated' };
  }
  const user = await getUserByWallet(wallet);
  if (!user) {
    return { status: 'unauthenticated' };
  }
  if (user.type !== 'business') {
    return { status: 'not_business' };
  }
  if (!user.is_verified) {
    return { status: 'unverified', user };
  }
  return { status: 'ok', user };
}

export async function loadCategoryDtos(): Promise<CategoryDto[]> {
  const categories = await listCategories();
  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    fields: parseCategoryFields(category.fields),
  }));
}

type DashboardViewRow = ViewRow<'v_business_dashboard'>;

async function listDashboardRows(businessId: string): Promise<DashboardViewRow[]> {
  const db = createServiceClient();
  const result = await db
    .from('v_business_dashboard')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });
  return unwrap(result, 'business.listDashboardRows');
}

function firstImageUrl(metadata: unknown): string | null {
  const parsed = parseAssetMetadata(metadata);
  return parsed.imageUrls[0] ?? null;
}

export function toBusinessAssetDto(
  asset: AssetRow,
  categoryNames: Map<string, string>,
  dashboardRow?: DashboardViewRow,
): BusinessAssetDto {
  return {
    id: asset.id,
    name: asset.name,
    status: asset.status,
    nftId: asset.nft_id,
    categoryId: asset.category_id,
    categoryName: categoryNames.get(asset.category_id) ?? 'Uncategorized',
    imageUrl: firstImageUrl(asset.metadata),
    createdAt: asset.created_at,
    totalSupply: asset.total_supply,
    availableSupply: asset.available_supply,
    valuation: parseNumeric(asset.valuation),
    mintPricePerFraction: parseNumeric(asset.mint_price_per_fraction),
    kycRequired: asset.kyc_required,
    mintTxHash: asset.mint_tx_hash,
    unitsSold: dashboardRow?.units_sold ?? 0,
    grossRevenue: parseNumeric(dashboardRow?.gross_revenue) ?? 0,
    buyerCount: dashboardRow?.buyer_count ?? 0,
    lastSaleAt: dashboardRow?.last_sale_at ?? null,
    primaryRemaining: dashboardRow?.primary_remaining ?? 0,
    primaryPrice: parseNumeric(dashboardRow?.primary_price),
  };
}

export interface BusinessDashboardData {
  assets: BusinessAssetDto[];
  transactions: BusinessTransactionDto[];
}

/** Everything the dashboard renders, scoped to the calling business. */
export async function loadBusinessDashboard(user: UserRow): Promise<BusinessDashboardData> {
  const [assets, dashboardRows, categories, transactions] = await Promise.all([
    listAssetsByBusiness(user.id),
    listDashboardRows(user.id),
    listCategories(),
    listTransactionsForUser(user.id),
  ]);

  const categoryNames = new Map(categories.map((c) => [c.id, c.name]));
  const rowsByAsset = new Map(
    dashboardRows.filter((row) => row.asset_id).map((row) => [row.asset_id as string, row]),
  );
  const assetNames = new Map(assets.map((asset) => [asset.id, asset.name]));

  return {
    assets: assets.map((asset) => toBusinessAssetDto(asset, categoryNames, rowsByAsset.get(asset.id))),
    transactions: transactions.map((tx) => ({
      id: tx.id,
      type: tx.type,
      assetName: tx.asset_id ? (assetNames.get(tx.asset_id) ?? 'Unknown asset') : '-',
      quantity: tx.quantity,
      pricePerFraction: parseNumeric(tx.price_per_fraction),
      total: parseNumeric(tx.total),
      txHash: tx.tx_hash,
      createdAt: tx.created_at,
      counterpartyWallet: tx.from_user_id === user.id ? tx.to_wallet : tx.from_wallet,
    })),
  };
}

/** Form values for resuming a draft, merged over the category defaults. */
export function draftFormValues(asset: AssetRow, categories: CategoryDto[]): AssetFormValues {
  const category = categories.find((c) => c.id === asset.category_id) ?? categories[0];
  const metadata = parseAssetMetadata(asset.metadata);
  return {
    categoryId: category?.id ?? asset.category_id,
    title: asset.name,
    description: asset.description ?? '',
    dynamic: category
      ? { ...defaultDynamicValues(category), ...metadata.dynamic }
      : metadata.dynamic,
    valuation: parseNumeric(asset.valuation) ?? 0,
    fractions: asset.total_supply ?? 0,
    kycRequired: asset.kyc_required,
    images: metadata.imageUrls,
    documents: metadata.documentUrls,
  };
}

export function toBusinessProfileDto(user: UserRow): BusinessProfileDto {
  return {
    walletAddress: user.wallet_address,
    displayName: user.display_name ?? '',
    legalName: user.legal_name ?? '',
    email: user.email ?? '',
    phone: user.phone ?? '',
    logoUrl: user.logo_url,
    isVerified: user.is_verified,
  };
}

const DEFAULT_BUSINESS_PREFERENCES: Record<string, boolean> = {
  securityAlerts: true,
  transactionAlerts: true,
};

export function toBusinessSettingsDto(user: UserRow): BusinessSettingsDto {
  const settings =
    user.settings && typeof user.settings === 'object' && !Array.isArray(user.settings)
      ? (user.settings as Record<string, unknown>)
      : {};
  const preferences: Record<string, boolean> = { ...DEFAULT_BUSINESS_PREFERENCES };
  if (
    settings.preferences &&
    typeof settings.preferences === 'object' &&
    !Array.isArray(settings.preferences)
  ) {
    for (const [key, value] of Object.entries(settings.preferences as Record<string, unknown>)) {
      if (typeof value === 'boolean') {
        preferences[key] = value;
      }
    }
  }
  return {
    language: typeof settings.language === 'string' ? settings.language : 'English',
    currency: typeof settings.currency === 'string' ? settings.currency : 'USD',
    darkMode: typeof settings.darkMode === 'boolean' ? settings.darkMode : true,
    preferences,
  };
}
