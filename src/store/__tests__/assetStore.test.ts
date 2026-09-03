// src/store/__tests__/assetStore.test.ts
import { act } from '@testing-library/react';
import assetStore, { MarketplaceAsset } from '../assetStore';
import { getPublicSupabase } from '@/hooks/useSupabaseBrowser';

// Mock the browser Supabase client
jest.mock('@/hooks/useSupabaseBrowser', () => ({
    getPublicSupabase: jest.fn(),
}));

const mockedGetPublicSupabase = getPublicSupabase as jest.Mock;

function makeAsset(overrides: Partial<MarketplaceAsset> = {}): MarketplaceAsset {
    return {
        asset_id: 'asset-1',
        available_supply: 800,
        business_display_name: 'Acme Assets',
        business_id: 'business-1',
        business_logo_url: null,
        category_id: 'category-1',
        category_name: 'Watches',
        category_slug: 'watches',
        chain_id: 84532,
        created_at: '2026-01-01T00:00:00Z',
        description: null,
        erc20_token_address: null,
        floor_price_per_fraction: 10,
        is_purchasable: true,
        kyc_required: false,
        listed_quantity: 100,
        metadata: {},
        mint_price_per_fraction: 10,
        name: 'Test asset',
        nft_id: 1,
        status: 'active',
        total_supply: 1000,
        valuation: 10000,
        ...overrides,
    };
}

function mockSelect(result: { data: MarketplaceAsset[] | null; error: { message: string } | null }) {
    const order = jest.fn().mockResolvedValue(result);
    const select = jest.fn(() => ({ order }));
    const from = jest.fn(() => ({ select }));
    mockedGetPublicSupabase.mockReturnValue({ from });
    return { from, select, order };
}

describe('assetStore', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        act(() => {
            assetStore.setState({ assets: [], loading: false, error: null });
        });
    });

    describe('initial state', () => {
        it('should have empty assets array initially', () => {
            const { assets, loading, error } = assetStore.getState();
            expect(assets).toEqual([]);
            expect(loading).toBe(false);
            expect(error).toBeNull();
        });
    });

    describe('setAssets', () => {
        it('should update assets state', () => {
            const mockAssets = [makeAsset()];

            act(() => {
                assetStore.getState().setAssets(mockAssets);
            });

            expect(assetStore.getState().assets).toEqual(mockAssets);
        });

        it('should replace existing assets', () => {
            const initialAssets = [makeAsset({ asset_id: 'asset-1' })];
            const newAssets = [makeAsset({ asset_id: 'asset-2', name: 'Other asset' })];

            act(() => {
                assetStore.getState().setAssets(initialAssets);
            });
            act(() => {
                assetStore.getState().setAssets(newAssets);
            });

            expect(assetStore.getState().assets).toEqual(newAssets);
        });
    });

    describe('fetchAssets', () => {
        it('should hydrate assets from v_marketplace', async () => {
            const rows = [
                makeAsset({ asset_id: 'asset-2', created_at: '2026-02-01T00:00:00Z' }),
                makeAsset({ asset_id: 'asset-1', created_at: '2026-01-01T00:00:00Z' }),
            ];
            const { from, order } = mockSelect({ data: rows, error: null });

            let returned: MarketplaceAsset[] = [];
            await act(async () => {
                returned = await assetStore.getState().fetchAssets();
            });

            expect(from).toHaveBeenCalledWith('v_marketplace');
            expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
            expect(returned).toEqual(rows);
            const { assets, loading, error } = assetStore.getState();
            expect(assets).toEqual(rows);
            expect(loading).toBe(false);
            expect(error).toBeNull();
        });

        it('should set the error flag and keep previous assets on failure', async () => {
            const existing = [makeAsset()];
            act(() => {
                assetStore.getState().setAssets(existing);
            });
            mockSelect({ data: null, error: { message: 'boom' } });

            let returned: MarketplaceAsset[] = [];
            await act(async () => {
                returned = await assetStore.getState().fetchAssets();
            });

            expect(returned).toEqual(existing);
            const { assets, loading, error } = assetStore.getState();
            expect(assets).toEqual(existing);
            expect(loading).toBe(false);
            expect(error).toBe('Could not load marketplace assets');
        });
    });
});
