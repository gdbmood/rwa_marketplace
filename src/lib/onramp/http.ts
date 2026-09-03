import 'server-only';

import { NextResponse } from 'next/server';
import { AuthError } from '@/lib/auth/session';
import { MissingEnvError } from '@/lib/env';
import { OnrampProviderError } from '@/lib/onramp/types';

/**
 * Response helpers for the onramp API routes. Bodies follow the action
 * result contract from IMPLEMENTATION_PLAN.md:
 *   { ok: true, data } | { ok: false, error: { code, message } }
 */

export type ApiErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'invalid_input'
  | 'conflict'
  | 'kyc_required'
  | 'chain_error'
  | 'provider_error'
  | 'internal';

const HTTP_STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  invalid_input: 400,
  conflict: 409,
  kyc_required: 403,
  chain_error: 502,
  provider_error: 502,
  internal: 500,
};

export function jsonOk<T>(data: T): NextResponse {
  return NextResponse.json({ ok: true, data });
}

export function jsonError(code: ApiErrorCode, message: string, status?: number): NextResponse {
  return NextResponse.json(
    { ok: false, error: { code, message } },
    { status: status ?? HTTP_STATUS_BY_CODE[code] },
  );
}

/** Maps thrown errors onto the contract without leaking internals. */
export function errorResponse(error: unknown, context: string): NextResponse {
  if (error instanceof AuthError) {
    // AuthError 'not_found' means a valid JWT with no users row; for API
    // consumers both cases mean: sign in (again) first.
    return jsonError('unauthenticated', error.message);
  }
  if (error instanceof OnrampProviderError) {
    return jsonError(error.code, error.message);
  }
  if (error instanceof MissingEnvError) {
    console.error(`${context}:`, error.message);
    return jsonError('internal', 'Server is missing on-ramp configuration');
  }
  console.error(`${context}:`, error);
  return jsonError('internal', 'Something went wrong processing the on-ramp request');
}
