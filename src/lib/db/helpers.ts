import 'server-only';

import type { PostgrestError } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export type Row<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type InsertRow<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type UpdateRow<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
export type ViewRow<T extends keyof Database['public']['Views']> =
  Database['public']['Views'][T]['Row'];
export type Enum<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T];

export class DbError extends Error {
  constructor(
    message: string,
    readonly cause?: PostgrestError,
  ) {
    super(message);
    this.name = 'DbError';
  }
}

interface DbResult<T> {
  data: T | null;
  error: PostgrestError | null;
}

/** Throws on query error or missing data. Use when a row must exist. */
export function unwrap<T>(result: DbResult<T>, context: string): T {
  if (result.error) {
    throw new DbError(`${context}: ${result.error.message}`, result.error);
  }
  if (result.data === null) {
    throw new DbError(`${context}: no data returned`);
  }
  return result.data;
}

/** Throws on query error only; null means no row matched (not an error). */
export function unwrapMaybe<T>(result: DbResult<T>, context: string): T | null {
  if (result.error) {
    throw new DbError(`${context}: ${result.error.message}`, result.error);
  }
  return result.data;
}

const UNIQUE_VIOLATION = '23505';

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'cause' in error &&
    (error as DbError).cause?.code === UNIQUE_VIOLATION
  );
}

export function lowercaseWallet(wallet: string): string {
  return wallet.trim().toLowerCase();
}
