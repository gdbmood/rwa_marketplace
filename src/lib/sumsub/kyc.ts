import 'server-only';

import type { Json } from '@/types/database';
import { createServiceClient } from '@/lib/supabase/server';
import {
  type Enum,
  type Row,
  isUniqueViolation,
  unwrap,
  unwrapMaybe,
} from '@/lib/db/helpers';

/**
 * kyc_identities data access for the Sumsub integration. Lives here because
 * WS1 owns src/lib/sumsub; candidate to move to src/lib/db/kyc.ts at
 * integration time (see the workstream report).
 */

export type KycIdentityRow = Row<'kyc_identities'>;
export type KycStatus = Enum<'kyc_status'>;

const PROVIDER = 'sumsub';

export interface UpsertKycInput {
  userId: string;
  /** Sumsub applicant id. Null when the webhook did not carry one. */
  externalId: string | null;
  status: KycStatus;
  rawPayload?: Json | null;
  reviewedAt?: string | null;
}

/** Latest approved KYC identity for a user, if any. Used by the KYC gate. */
export async function getApprovedKycForUser(userId: string): Promise<KycIdentityRow | null> {
  const db = createServiceClient();
  const result = await db
    .from('kyc_identities')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return unwrapMaybe(result, 'sumsub.getApprovedKycForUser');
}

/**
 * Upserts a kyc_identities row keyed by (provider, external applicant id).
 * Falls back to the user's latest sumsub row when no applicant id is present.
 * Manual select-then-write because the unique index on (provider, external_id)
 * is partial, which ON CONFLICT cannot target through PostgREST.
 */
export async function upsertKycByExternalId(input: UpsertKycInput): Promise<KycIdentityRow> {
  const db = createServiceClient();

  const patch = {
    user_id: input.userId,
    status: input.status,
    raw_payload: input.rawPayload ?? null,
    reviewed_at: input.reviewedAt ?? null,
  };

  let existing: KycIdentityRow | null;
  if (input.externalId) {
    const found = await db
      .from('kyc_identities')
      .select('*')
      .eq('provider', PROVIDER)
      .eq('external_id', input.externalId)
      .maybeSingle();
    existing = unwrapMaybe(found, 'sumsub.upsertKycByExternalId');
  } else {
    const found = await db
      .from('kyc_identities')
      .select('*')
      .eq('provider', PROVIDER)
      .eq('user_id', input.userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    existing = unwrapMaybe(found, 'sumsub.upsertKycByExternalId');
  }

  if (existing) {
    const updated = await db
      .from('kyc_identities')
      .update(patch)
      .eq('id', existing.id)
      .select('*')
      .single();
    return unwrap(updated, 'sumsub.upsertKycByExternalId');
  }

  try {
    const inserted = await db
      .from('kyc_identities')
      .insert({ ...patch, provider: PROVIDER, external_id: input.externalId })
      .select('*')
      .single();
    return unwrap(inserted, 'sumsub.upsertKycByExternalId');
  } catch (error) {
    // Concurrent webhook delivery for the same applicant: update the winner's row.
    if (!isUniqueViolation(error) || !input.externalId) {
      throw error;
    }
    const raced = await db
      .from('kyc_identities')
      .update(patch)
      .eq('provider', PROVIDER)
      .eq('external_id', input.externalId)
      .select('*')
      .single();
    return unwrap(raced, 'sumsub.upsertKycByExternalId');
  }
}
