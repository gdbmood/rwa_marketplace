/**
 * Client-safe types and pure helpers for the business frontend.
 * No server imports here: these modules are shared by server pages (for DTO
 * mapping) and client components (forms, dashboards, mint flow).
 */

export type BusinessAssetStatus = 'draft' | 'minting' | 'active' | 'sold_out' | 'delisted';

export type FieldKind = 'string' | 'textArea' | 'dropdown' | 'document' | 'number' | 'date';

export interface FieldSpec {
    /** Display label, e.g. "Hash Rate". */
    name: string;
    /** Camel-cased metadata key, e.g. "hashRate". */
    key: string;
    type: FieldKind;
    options?: string[];
    /** For number fields a plain bound; for date fields an epoch (ms) bound. */
    min?: number;
    max?: number;
}

export interface CategoryDto {
    id: string;
    name: string;
    slug: string;
    fields: FieldSpec[];
}

export interface BusinessAssetDto {
    id: string;
    name: string;
    status: BusinessAssetStatus;
    nftId: number | null;
    categoryId: string;
    categoryName: string;
    imageUrl: string | null;
    createdAt: string;
    totalSupply: number | null;
    availableSupply: number | null;
    valuation: number | null;
    mintPricePerFraction: number | null;
    kycRequired: boolean;
    mintTxHash: string | null;
    unitsSold: number;
    grossRevenue: number;
    buyerCount: number;
    lastSaleAt: string | null;
    primaryRemaining: number;
    primaryPrice: number | null;
}

export interface BusinessTransactionDto {
    id: string;
    type: string;
    assetName: string;
    quantity: number | null;
    pricePerFraction: number | null;
    total: number | null;
    txHash: string | null;
    createdAt: string;
    counterpartyWallet: string | null;
}

export interface BusinessProfileDto {
    walletAddress: string;
    displayName: string;
    legalName: string;
    email: string;
    phone: string;
    logoUrl: string | null;
    isVerified: boolean;
}

export interface BusinessSettingsDto {
    language: string;
    currency: string;
    darkMode: boolean;
    preferences: Record<string, boolean>;
}

/** Draft form initial values, also produced when resuming a saved draft. */
export interface AssetFormValues {
    categoryId: string;
    title: string;
    description: string;
    /** Camel-cased dynamic field values (strings, numbers, ISO date strings). */
    dynamic: Record<string, string | number>;
    valuation: number;
    fractions: number;
    kycRequired: boolean;
    images: (File | string)[];
    documents: Record<string, (File | string)[]>;
}

/** Primary listing summary passed to the update screen. */
export interface PrimaryListingDto {
    id: string;
    quantity: number;
    pricePerFraction: number;
}

/** Legacy camel-casing: "Hash Rate" becomes "hashRate". Must not change. */
export function fieldKey(name: string): string {
    return name.charAt(0).toLowerCase() + name.slice(1).replace(/\s+/g, '');
}

const SENTINELS: Record<string, () => number> = {
    currentYear: () => new Date().getFullYear(),
    today: () => Date.now(),
    todayPlus10Years: () => {
        const d = new Date();
        d.setFullYear(d.getFullYear() + 10);
        return d.getTime();
    },
};

function resolveBound(value: unknown): number | undefined {
    if (typeof value === 'number') {
        return value;
    }
    if (typeof value === 'string' && SENTINELS[value]) {
        return SENTINELS[value]();
    }
    return undefined;
}

const FIELD_KINDS: FieldKind[] = ['string', 'textArea', 'dropdown', 'document', 'number', 'date'];

/** Parses the jsonb `fields` column of asset_categories into typed specs. */
export function parseCategoryFields(fields: unknown): FieldSpec[] {
    if (!Array.isArray(fields)) {
        return [];
    }
    const specs: FieldSpec[] = [];
    for (const raw of fields) {
        if (typeof raw !== 'object' || raw === null) {
            continue;
        }
        const field = raw as Record<string, unknown>;
        const name = typeof field.name === 'string' ? field.name : null;
        const type = FIELD_KINDS.includes(field.type as FieldKind) ? (field.type as FieldKind) : null;
        if (!name || !type) {
            continue;
        }
        const options = Array.isArray(field.options)
            ? field.options.filter((o): o is string => typeof o === 'string')
            : undefined;
        specs.push({
            name,
            key: fieldKey(name),
            type,
            options,
            min: resolveBound(field.min),
            max: resolveBound(field.max),
        });
    }
    return specs;
}

/** Default dynamic values for a category, mirroring the legacy form defaults. */
export function defaultDynamicValues(category: CategoryDto): Record<string, string | number> {
    const dynamic: Record<string, string | number> = {};
    for (const field of category.fields) {
        if (field.type === 'string' || field.type === 'textArea' || field.type === 'date') {
            dynamic[field.key] = '';
        } else if (field.type === 'number') {
            dynamic[field.key] = field.min ?? 0;
        } else if (field.type === 'dropdown') {
            dynamic[field.key] = field.options?.[0] ?? '';
        }
    }
    return dynamic;
}

export function emptyFormValues(category: CategoryDto): AssetFormValues {
    return {
        categoryId: category.id,
        title: '',
        description: '',
        dynamic: defaultDynamicValues(category),
        valuation: 0,
        fractions: 0,
        kycRequired: false,
        images: [],
        documents: {},
    };
}

/** Parsed shape of the stored asset metadata (drafts and minted assets). */
export interface ParsedAssetMetadata {
    imageUrls: string[];
    documentUrls: Record<string, string[]>;
    dynamic: Record<string, string | number>;
    kycRequired: boolean;
}

const METADATA_RESERVED_KEYS = new Set([
    'nftName',
    'description',
    'imageUrls',
    'documentUrls',
    'assetClass',
    'userKycRequired',
]);

export function parseAssetMetadata(metadata: unknown): ParsedAssetMetadata {
    const parsed: ParsedAssetMetadata = {
        imageUrls: [],
        documentUrls: {},
        dynamic: {},
        kycRequired: false,
    };
    if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
        return parsed;
    }
    const record = metadata as Record<string, unknown>;
    if (Array.isArray(record.imageUrls)) {
        parsed.imageUrls = record.imageUrls.filter((u): u is string => typeof u === 'string');
    }
    if (typeof record.documentUrls === 'object' && record.documentUrls !== null && !Array.isArray(record.documentUrls)) {
        for (const [key, value] of Object.entries(record.documentUrls as Record<string, unknown>)) {
            if (Array.isArray(value)) {
                parsed.documentUrls[key] = value.filter((u): u is string => typeof u === 'string');
            }
        }
    }
    if (typeof record.userKycRequired === 'boolean') {
        parsed.kycRequired = record.userKycRequired;
    }
    for (const [key, value] of Object.entries(record)) {
        if (METADATA_RESERVED_KEYS.has(key)) {
            continue;
        }
        if (typeof value === 'string' || typeof value === 'number') {
            parsed.dynamic[key] = value;
        }
    }
    return parsed;
}

/**
 * On-chain metadata JSON, byte-compatible with the legacy list flow:
 * { nftName, description, imageUrls, documentUrls, ...dynamic fields,
 *   userKycRequired, assetClass }.
 */
export function buildOnChainMetadata(
    values: AssetFormValues,
    categoryName: string,
    imageUrls: string[],
    documentUrls: Record<string, string[]>,
): Record<string, unknown> {
    return {
        nftName: values.title,
        description: values.description,
        imageUrls,
        documentUrls,
        ...values.dynamic,
        userKycRequired: values.kycRequired,
        assetClass: categoryName,
    };
}

const MIN_PRICE_PER_FRACTION = 0.000001;

/**
 * Full pre-mint validation, mirroring the legacy client checks. Returns an
 * error message or null when the values are valid.
 */
export function validateAssetValues(values: AssetFormValues, category: CategoryDto): string | null {
    if (!values.title.trim() || !values.description.trim()) {
        return 'All fields are required';
    }
    for (const field of category.fields) {
        if (field.type === 'document') {
            continue;
        }
        const value = values.dynamic[field.key];
        if (value === undefined || (typeof value === 'string' && !value.trim()) || (typeof value === 'number' && value === 0)) {
            return 'All fields are required';
        }
        if (field.type === 'number' && typeof value === 'number') {
            if (field.min !== undefined && value < field.min) {
                return `${field.name} should be greater than ${field.min}`;
            }
            if (field.max !== undefined && value > field.max) {
                return `${field.name} should be less than ${field.max}`;
            }
        }
        if (field.type === 'date' && typeof value === 'string') {
            const time = new Date(value).getTime();
            if (Number.isNaN(time)) {
                return `${field.name} is not a valid date`;
            }
            if (field.min !== undefined && time < field.min) {
                return `${field.name} should be after ${new Date(field.min).toLocaleDateString()}`;
            }
            if (field.max !== undefined && time > field.max) {
                return `${field.name} should be before ${new Date(field.max).toLocaleDateString()}`;
            }
        }
    }
    if (values.valuation <= 0 || values.fractions <= 0) {
        return 'All fields are required';
    }
    if (values.images.length === 0) {
        return 'At least one image is required';
    }
    for (const field of category.fields) {
        if (field.type === 'document' && (values.documents[field.key]?.length ?? 0) === 0) {
            return 'All documents are required';
        }
    }
    if (values.valuation / values.fractions < MIN_PRICE_PER_FRACTION) {
        return 'Price per fraction should be greater than 0.000001';
    }
    return null;
}

/** USDC price per fraction rounded to 6 decimals, like the legacy flow. */
export function pricePerFraction(valuation: number, fractions: number): number {
    return Math.round((valuation / fractions) * 1e6) / 1e6;
}

/** USDC units to on-chain micro USDC (6 decimals). */
export function usdcToMicro(value: number): bigint {
    return BigInt(Math.round(value * 1e6));
}

export const ASSET_STATUS_LABELS: Record<BusinessAssetStatus, string> = {
    draft: 'Coming soon',
    minting: 'Minting',
    active: 'Listed',
    sold_out: 'Sold out',
    delisted: 'Delisted',
};

export function formatUsd(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return '$0';
    }
    return `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

export function shortenAddress(address: string | null | undefined): string {
    if (!address) {
        return '-';
    }
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
