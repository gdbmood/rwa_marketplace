import { create } from 'zustand';
import type { Tables } from '@/types/database';
import { getPublicSupabase } from '@/hooks/useSupabaseBrowser';

/**
 * Marketplace catalog, hydrated from the public v_marketplace view through
 * the anon Supabase client (definer view, safe columns only). Replaces the
 * Firestore Asset collection reads.
 *
 * Shape changes vs the Firestore era (documented for the page rewrites):
 *  - rows are v_marketplace rows: `asset_id` (uuid) replaces `_id`,
 *    `category_name`/`category_slug` replace `assetCategory`,
 *    `business_id`/`business_display_name` replace `minterId`,
 *    `floor_price_per_fraction` replaces `pricePerFraction`,
 *    `total_supply`/`available_supply` replace initial/availableSupply
 *  - draft assets appear with status 'draft' (rendered as Coming soon)
 *  - the store no longer chains into nftStore; screens that need on-chain
 *    NFT metadata fetch it explicitly
 */

export type MarketplaceAsset = Tables<'v_marketplace'>;

interface AssetState {
    assets: MarketplaceAsset[];
    loading: boolean;
    error: string | null;
    setAssets: (newState: MarketplaceAsset[]) => void;
    fetchAssets: () => Promise<MarketplaceAsset[]>;
}

const assetStore = create<AssetState>((set, get) => ({
    assets: [],
    loading: false,
    error: null,
    setAssets: (newState: MarketplaceAsset[]) => set({ assets: newState }),
    fetchAssets: async () => {
        set({ loading: true, error: null });
        try {
            const { data, error } = await getPublicSupabase()
                .from('v_marketplace')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) {
                throw new Error(error.message);
            }
            const assets = data ?? [];
            set({ assets, loading: false });
            return assets;
        } catch (error) {
            console.error('assetStore.fetchAssets:', error);
            set({ loading: false, error: 'Could not load marketplace assets' });
            return get().assets;
        }
    },
}));

export default assetStore;
