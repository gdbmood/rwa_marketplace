import 'server-only';

import type { Json } from '@/types/database';
import { createServiceClient } from '@/lib/supabase/server';
import { type Enum, type Row, type UpdateRow, unwrap, unwrapMaybe } from '@/lib/db/helpers';
import { type NumericInput, numericColumn } from '@/lib/db/numeric';

export type OnrampSessionRow = Row<'onramp_sessions'>;
export type OnrampStatus = Enum<'onramp_status'>;

export interface CreateOnrampSessionInput {
  userId: string;
  provider: string;
  providerSessionId?: string | null;
  orderId?: string | null;
  fiatCurrency?: string | null;
  fiatAmount?: NumericInput | null;
  tokenAmount?: NumericInput | null;
  rawPayload?: Json | null;
}

export interface OnrampSessionPatch {
  status?: OnrampStatus;
  orderId?: string | null;
  fiatCurrency?: string | null;
  fiatAmount?: NumericInput | null;
  tokenAmount?: NumericInput | null;
  rawPayload?: Json | null;
}

export async function createOnrampSession(
  input: CreateOnrampSessionInput,
): Promise<OnrampSessionRow> {
  const db = createServiceClient();
  const result = await db
    .from('onramp_sessions')
    .insert({
      user_id: input.userId,
      provider: input.provider,
      provider_session_id: input.providerSessionId ?? null,
      order_id: input.orderId ?? null,
      fiat_currency: input.fiatCurrency ?? null,
      fiat_amount: input.fiatAmount != null ? numericColumn(input.fiatAmount) : null,
      token_amount: input.tokenAmount != null ? numericColumn(input.tokenAmount) : null,
      raw_payload: input.rawPayload ?? null,
      status: 'created',
    })
    .select('*')
    .single();
  return unwrap(result, 'onramp.createOnrampSession');
}

/** Keyed by the provider's session id, as delivered in provider webhooks. */
export async function updateOnrampSession(
  providerSessionId: string,
  patch: OnrampSessionPatch,
): Promise<OnrampSessionRow | null> {
  const db = createServiceClient();

  const update: UpdateRow<'onramp_sessions'> = {};
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.orderId !== undefined) update.order_id = patch.orderId;
  if (patch.fiatCurrency !== undefined) update.fiat_currency = patch.fiatCurrency;
  if (patch.fiatAmount !== undefined) {
    update.fiat_amount = patch.fiatAmount != null ? numericColumn(patch.fiatAmount) : null;
  }
  if (patch.tokenAmount !== undefined) {
    update.token_amount = patch.tokenAmount != null ? numericColumn(patch.tokenAmount) : null;
  }
  if (patch.rawPayload !== undefined) update.raw_payload = patch.rawPayload;

  const result = await db
    .from('onramp_sessions')
    .update(update)
    .eq('provider_session_id', providerSessionId)
    .select('*')
    .maybeSingle();
  return unwrapMaybe(result, 'onramp.updateOnrampSession');
}

export async function getOnrampSessionByProviderId(
  providerSessionId: string,
): Promise<OnrampSessionRow | null> {
  const db = createServiceClient();
  const result = await db
    .from('onramp_sessions')
    .select('*')
    .eq('provider_session_id', providerSessionId)
    .maybeSingle();
  return unwrapMaybe(result, 'onramp.getOnrampSessionByProviderId');
}
