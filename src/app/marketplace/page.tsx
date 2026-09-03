import { listCategories, type AssetCategoryRow } from '@/lib/db/categories';
import { createServiceClient } from '@/lib/supabase/server';
import { unwrap } from '@/lib/db/helpers';
import type { MarketplaceAssetRow } from '@/lib/db/assets';
import MarketplaceBrowse from '@/components/marketplace/marketplace-browse';

export const dynamic = 'force-dynamic';

/**
 * Marketplace browse. Server component: reads the public v_marketplace view
 * (drafts and minting assets included, rendered as Coming soon cards) and the
 * active category schemas, then hands everything to the client browser for
 * filtering. All interactivity lives in MarketplaceBrowse.
 */
async function listBrowseAssets(): Promise<MarketplaceAssetRow[]> {
  const db = createServiceClient();
  const result = await db
    .from('v_marketplace')
    .select('*')
    .order('created_at', { ascending: false });
  return unwrap(result, 'marketplace.listBrowseAssets');
}

interface MarketplacePageProps {
  searchParams: Promise<{ category?: string }>;
}

export default async function MarketplacePage({ searchParams }: MarketplacePageProps) {
  const { category } = await searchParams;

  let assets: MarketplaceAssetRow[] = [];
  let categories: AssetCategoryRow[] = [];
  let loadFailed = false;
  try {
    [assets, categories] = await Promise.all([listBrowseAssets(), listCategories()]);
  } catch (error) {
    console.error('[marketplace.page] load failed', error);
    loadFailed = true;
  }

  return (
    <MarketplaceBrowse
      assets={assets}
      categories={categories}
      initialCategorySlug={category ?? null}
      loadFailed={loadFailed}
    />
  );
}
