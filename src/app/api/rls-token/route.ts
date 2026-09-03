import { AuthError, requireUser } from '@/lib/auth/session';
import { mintRlsJwt } from '@/lib/auth/rlsJwt';

/**
 * GET /api/rls-token
 *
 * Exchanges the verified session cookie for a short-lived Supabase RLS JWT so
 * the browser's read-only supabase client can select the caller's own rows.
 * Response: { token: string } or 401 when there is no valid session.
 */
export async function GET() {
  try {
    const { user, wallet } = await requireUser();
    const token = await mintRlsJwt({ userId: user.id, wallet });
    return Response.json({ token });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[rls-token]', error instanceof Error ? error.message : error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
