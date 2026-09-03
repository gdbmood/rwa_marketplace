import { NextRequest } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth/session';
import {
  SUMSUB_LEVELS,
  SumsubApiError,
  type SumsubLevel,
  createSdkAccessToken,
} from '@/lib/sumsub/client';

/**
 * GET /api/create-verification-session?level=id-only|id-and-liveness
 *
 * Mints a Sumsub WebSDK access token for the logged-in user. The session JWT
 * is fully verified through requireUser (signature and expiry, never
 * jose.decodeJwt), the business level is restricted to business accounts,
 * and the external user id is the session wallet, never client input.
 * Response shape (a JSON string containing the token) is unchanged for the
 * existing verify pages.
 */
export async function GET(req: NextRequest) {
  const level = req.nextUrl.searchParams.get('level');
  if (!level || !SUMSUB_LEVELS.includes(level as SumsubLevel)) {
    return new Response('Level not found', { status: 400 });
  }

  let user;
  let wallet;
  try {
    ({ user, wallet } = await requireUser());
  } catch (error) {
    if (error instanceof AuthError) {
      return new Response('Unauthorized', { status: 401 });
    }
    console.error('[create-verification-session] session check failed');
    return new Response('Internal Server Error', { status: 500 });
  }

  if (level === 'id-and-liveness' && user.type !== 'business') {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const token = await createSdkAccessToken(wallet, level as SumsubLevel);
    return Response.json(token);
  } catch (error) {
    // Log status only; the Sumsub error body can carry applicant PII.
    const status = error instanceof SumsubApiError ? error.status : 'unknown';
    console.error(`[create-verification-session] Sumsub token request failed (${status})`);
    return new Response('Error creating an applicant', { status: 500 });
  }
}
