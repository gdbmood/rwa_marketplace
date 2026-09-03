import { create } from 'zustand';
import type { FieldType } from '@/constants';
import type { Json, Tables } from '@/types/database';
import { getPublicSupabase } from '@/hooks/useSupabaseBrowser';

/**
 * Asset categories with their per class form and filter schemas.
 *
 * Source moved from Firestore (AssetCategory + fields subcollection) to the
 * public asset_categories table: the field schema is a jsonb array in the
 * same shape as src/constants.ts, read here through the anon Supabase client
 * (categories are public under RLS).
 *
 * Shape changes vs the Firestore era, kept minimal for the pages:
 *  - `_id` is now the row uuid (was the Firestore doc id / display name)
 *  - `slug` is new; `image` is derived from it (the table has no image
 *    column, artwork ships with the app under public/webp/categories)
 *  - date/number sentinels from the seed ("currentYear", "today",
 *    "todayPlus10Years") are resolved to real values here, so `fields`
 *    matches the FieldType contract the forms expect.
 */

type CategoryRow = Tables<'asset_categories'>;

export type Category = {
    _id: string;
    isEnabled: boolean;
    name: string;
    slug: string;
    image: string;
    fields: FieldType[];
};

const CATEGORY_IMAGE_BY_SLUG: Record<string, string> = {
    'luxury-yachts': '/webp/categories/yachts.webp',
    'luxury-cars': '/webp/categories/cars.webp',
    'real-estate-properties': '/webp/categories/real-estate.webp',
};

const DIRECT_IMAGE_SLUGS = new Set([
    'camels',
    'carbon-credits',
    'crowdfunding',
    'crypto-mining-farm',
    'diamonds',
    'falcons',
    'financial-derivatives',
    'horses',
    'ip-and-brands',
    'nfts',
    'private-jets',
    'recycle-oasis',
    'watches',
]);

const FALLBACK_CATEGORY_IMAGE = '/webp/Card.webp';

export function categoryImageForSlug(slug: string): string {
    const mapped = CATEGORY_IMAGE_BY_SLUG[slug];
    if (mapped) {
        return mapped;
    }
    if (DIRECT_IMAGE_SLUGS.has(slug)) {
        return `/webp/categories/${slug}.webp`;
    }
    return FALLBACK_CATEGORY_IMAGE;
}

/** Resolves the seed's dynamic sentinels to concrete values. */
function resolveBound(value: unknown, fieldType: string): number | Date | undefined {
    if (typeof value === 'number') {
        return value;
    }
    if (value === 'currentYear') {
        return new Date().getFullYear();
    }
    if (value === 'today') {
        return new Date();
    }
    if (value === 'todayPlus10Years') {
        const d = new Date();
        d.setFullYear(d.getFullYear() + 10);
        return d;
    }
    if (typeof value === 'string' && fieldType === 'date') {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? undefined : parsed;
    }
    return undefined;
}

function toStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }
    const items = value.filter((item): item is string => typeof item === 'string');
    return items.length > 0 ? items : undefined;
}

/** Maps one jsonb field object onto the FieldType union; null when invalid. */
function parseField(raw: Json): FieldType | null {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        return null;
    }
    const obj = raw as Record<string, unknown>;
    const name = typeof obj.name === 'string' ? obj.name : null;
    const type = typeof obj.type === 'string' ? obj.type : null;
    if (!name || !type) {
        return null;
    }

    switch (type) {
        case 'string':
            return { name, type, filterOptions: toStringArray(obj.filterOptions) };
        case 'textArea':
            return { name, type };
        case 'document':
            return { name, type };
        case 'dropdown': {
            const options = toStringArray(obj.options);
            if (!options) {
                return null;
            }
            return {
                name,
                type,
                options,
                filter: typeof obj.filter === 'boolean' ? obj.filter : undefined,
            };
        }
        case 'number': {
            const min = resolveBound(obj.min, type);
            const max = resolveBound(obj.max, type);
            return {
                name,
                type,
                min: typeof min === 'number' ? min : undefined,
                max: typeof max === 'number' ? max : undefined,
                filterOptions: toStringArray(obj.filterOptions),
            };
        }
        case 'date': {
            const min = resolveBound(obj.min, type);
            const max = resolveBound(obj.max, type);
            return {
                name,
                type,
                min: min instanceof Date ? min : undefined,
                max: max instanceof Date ? max : undefined,
                filterOptions: toStringArray(obj.filterOptions),
            };
        }
        default:
            return null;
    }
}

export function mapCategoryRow(row: CategoryRow): Category {
    const rawFields = Array.isArray(row.fields) ? row.fields : [];
    const fields = rawFields
        .map(parseField)
        .filter((field): field is FieldType => field !== null);
    return {
        _id: row.id,
        isEnabled: row.is_active,
        name: row.name,
        slug: row.slug,
        image: categoryImageForSlug(row.slug),
        fields,
    };
}

interface CategoryState {
    categories: Category[];
    loading: boolean;
    error: string | null;
    setCategories: (newState: Category[]) => void;
    fetchCategories: () => Promise<Category[]>;
}

const categoryStore = create<CategoryState>((set, get) => ({
    categories: [],
    loading: false,
    error: null,
    setCategories: (newState: Category[]) => set({ categories: newState }),
    fetchCategories: async () => {
        set({ loading: true, error: null });
        try {
            const { data, error } = await getPublicSupabase()
                .from('asset_categories')
                .select('*')
                .eq('is_active', true)
                .order('name', { ascending: true });
            if (error) {
                throw new Error(error.message);
            }
            const categories = (data ?? []).map(mapCategoryRow);
            set({ categories, loading: false });
            return categories;
        } catch (error) {
            console.error('categoryStore.fetchCategories:', error);
            set({ loading: false, error: 'Could not load asset categories' });
            return get().categories;
        }
    },
}));

export default categoryStore;
