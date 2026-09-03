/**
 * Client-safe formatting and metadata helpers for the investor (retail)
 * screens. Money values arrive from the database as numeric strings in USDC
 * units (the generated types say number, the wire says string), so every
 * display path goes through parseAmount before any arithmetic.
 */

import type { Json } from '@/types/database';

/** Parses a numeric column value (string on the wire) into a number. */
export function parseAmount(value: number | string | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Formats a USDC amount for display, up to 6 decimals, no trailing zeros. */
export function formatUsdc(value: number | string | null | undefined): string {
  return parseAmount(value).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

/** Formats a fiat amount for display with 2 decimals. */
export function formatFiat(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Shortens a wallet address or hash for table display. */
export function shortenHex(value: string | null | undefined): string {
  if (!value) {
    return '-';
  }
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

/** Explorer link for a transaction hash, or null when unavailable. */
export function explorerTxUrl(txHash: string | null | undefined): string | null {
  const base = process.env.NEXT_PUBLIC_BLOCKCHAIN_EXPLORER_URL;
  if (!base || !txHash) {
    return null;
  }
  return `${base.replace(/\/$/, '')}/tx/${txHash}`;
}

/**
 * Category field names are camel-cased into metadata keys by the listing
 * form ("Property Area" becomes propertyArea). Same convention as the
 * legacy marketplace filters.
 */
export function metadataKeyForField(fieldName: string): string {
  const compact = fieldName.replace(/\s+/g, ' ').trim();
  if (!compact) {
    return '';
  }
  const camel = compact.charAt(0).toLowerCase() + compact.slice(1);
  return camel.replace(/\s+/g, '');
}

export type MetadataObject = Record<string, Json | undefined>;

/** Narrows a jsonb metadata column to an object, or an empty one. */
export function asMetadataObject(metadata: Json | null | undefined): MetadataObject {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return metadata as MetadataObject;
  }
  return {};
}

/** Image URLs stored by the mint flow under metadata.imageUrls. */
export function metadataImageUrls(metadata: Json | null | undefined): string[] {
  const value = asMetadataObject(metadata).imageUrls;
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((url): url is string => typeof url === 'string' && url.length > 0);
}

export interface DocumentGroup {
  name: string;
  urls: string[];
}

/** Every document group under metadata.documentUrls (not just the first). */
export function metadataDocumentGroups(metadata: Json | null | undefined): DocumentGroup[] {
  const value = asMetadataObject(metadata).documentUrls;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }
  const groups: DocumentGroup[] = [];
  for (const [name, urls] of Object.entries(value)) {
    if (!Array.isArray(urls)) {
      continue;
    }
    const clean = urls.filter(
      (url): url is string => typeof url === 'string' && url.length > 0,
    );
    if (clean.length > 0) {
      groups.push({ name, urls: clean });
    }
  }
  return groups;
}

/** A displayable scalar metadata value for a camel-cased key, or null. */
export function metadataValue(
  metadata: Json | null | undefined,
  key: string,
): string | null {
  const value = asMetadataObject(metadata)[key];
  if (typeof value === 'string' && value.trim() !== '') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

/**
 * Field schema stored on asset_categories.fields (jsonb). Mirrors the shape
 * seeded from constants.ts; see supabase/migrations/..._seed_asset_categories.sql.
 */
export interface CategoryField {
  name: string;
  type: 'string' | 'textArea' | 'dropdown' | 'document' | 'number' | 'date';
  options?: string[];
  filter?: boolean;
  filterOptions?: string[];
  min?: number | string;
  max?: number | string;
}

/** Parses the jsonb field schema of a category, dropping malformed entries. */
export function parseCategoryFields(fields: Json | null | undefined): CategoryField[] {
  if (!Array.isArray(fields)) {
    return [];
  }
  const parsed: CategoryField[] = [];
  for (const entry of fields) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }
    const record = entry as Record<string, Json | undefined>;
    if (typeof record.name !== 'string' || typeof record.type !== 'string') {
      continue;
    }
    parsed.push({
      name: record.name,
      type: record.type as CategoryField['type'],
      options: Array.isArray(record.options)
        ? record.options.filter((o): o is string => typeof o === 'string')
        : undefined,
      filter: typeof record.filter === 'boolean' ? record.filter : undefined,
      filterOptions: Array.isArray(record.filterOptions)
        ? record.filterOptions.filter((o): o is string => typeof o === 'string')
        : undefined,
    });
  }
  return parsed;
}

/**
 * True when a metadata value matches a filter bucket. Buckets follow the
 * legacy convention: "100-500" is a range, "500+" is a minimum, anything
 * else is an exact string match.
 */
export function matchesFilterBucket(value: string | null, bucket: string): boolean {
  if (value === null) {
    return false;
  }
  if (bucket.includes('-')) {
    const [low, high] = bucket.split('-');
    const parsed = Number(value);
    return Number.isFinite(parsed) && Number(low) <= parsed && parsed < Number(high);
  }
  if (bucket.endsWith('+')) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= Number(bucket.slice(0, -1));
  }
  return value === bucket;
}
