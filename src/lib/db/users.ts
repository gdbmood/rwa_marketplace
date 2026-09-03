import 'server-only';

import type { Json } from '@/types/database';
import { createServiceClient } from '@/lib/supabase/server';
import {
  type Enum,
  type Row,
  type UpdateRow,
  isUniqueViolation,
  lowercaseWallet,
  unwrap,
  unwrapMaybe,
} from '@/lib/db/helpers';

export type UserRow = Row<'users'>;
export type UserType = Enum<'user_type'>;

const PROFILE_FIELDS = [
  'name',
  'email',
  'phone',
  'display_name',
  'legal_name',
  'logo_url',
] as const;

export type UserProfilePatch = Partial<
  Pick<UpdateRow<'users'>, (typeof PROFILE_FIELDS)[number]>
>;

export async function getUserByWallet(wallet: string): Promise<UserRow | null> {
  const db = createServiceClient();
  const result = await db
    .from('users')
    .select('*')
    .eq('wallet_address', lowercaseWallet(wallet))
    .maybeSingle();
  return unwrapMaybe(result, 'users.getUserByWallet');
}

/**
 * Idempotent login write: creates the user on first login (with the requested
 * type), otherwise only bumps last_login_at. The stored type is never changed
 * by a later login with a different type.
 */
export async function upsertUserOnLogin(wallet: string, type: UserType): Promise<UserRow> {
  const db = createServiceClient();
  const address = lowercaseWallet(wallet);
  const now = new Date().toISOString();

  const existing = await getUserByWallet(address);
  if (existing) {
    const updated = await db
      .from('users')
      .update({ last_login_at: now })
      .eq('id', existing.id)
      .select('*')
      .single();
    return unwrap(updated, 'users.upsertUserOnLogin');
  }

  try {
    const inserted = await db
      .from('users')
      .insert({ wallet_address: address, type, last_login_at: now })
      .select('*')
      .single();
    return unwrap(inserted, 'users.upsertUserOnLogin');
  } catch (error) {
    // Concurrent first login for the same wallet: fall back to the update path.
    if (!isUniqueViolation(error)) {
      throw error;
    }
    const raced = await db
      .from('users')
      .update({ last_login_at: now })
      .eq('wallet_address', address)
      .select('*')
      .single();
    return unwrap(raced, 'users.upsertUserOnLogin');
  }
}

/**
 * Whitelisted profile update. When display_name or logo_url change, the public
 * business_profiles projection is upserted in the same call so v_marketplace
 * stays consistent.
 */
export async function updateUserProfile(
  userId: string,
  patch: UserProfilePatch,
): Promise<UserRow> {
  const db = createServiceClient();

  const update: UpdateRow<'users'> = {};
  for (const field of PROFILE_FIELDS) {
    if (patch[field] !== undefined) {
      update[field] = patch[field];
    }
  }

  const result = await db
    .from('users')
    .update(update)
    .eq('id', userId)
    .select('*')
    .single();
  const user = unwrap(result, 'users.updateUserProfile');

  if (patch.display_name !== undefined || patch.logo_url !== undefined) {
    const profile = await db.from('business_profiles').upsert(
      {
        user_id: userId,
        display_name: user.display_name,
        logo_url: user.logo_url,
      },
      { onConflict: 'user_id' },
    );
    if (profile.error) {
      throw new Error(`users.updateUserProfile business_profiles: ${profile.error.message}`);
    }
  }

  return user;
}

export async function updateUserSettings(userId: string, settings: Json): Promise<UserRow> {
  const db = createServiceClient();
  const result = await db
    .from('users')
    .update({ settings })
    .eq('id', userId)
    .select('*')
    .single();
  return unwrap(result, 'users.updateUserSettings');
}

export async function setUserVerified(userId: string, verified: boolean): Promise<UserRow> {
  const db = createServiceClient();
  const result = await db
    .from('users')
    .update({ is_verified: verified })
    .eq('id', userId)
    .select('*')
    .single();
  return unwrap(result, 'users.setUserVerified');
}
