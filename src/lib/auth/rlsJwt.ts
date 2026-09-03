import 'server-only';

import { SignJWT } from 'jose';
import { serverEnv } from '@/lib/env';

const RLS_JWT_TTL = '30m';

export interface MintRlsJwtInput {
  /** users.id (uuid), becomes the JWT sub used by RLS policies. */
  userId: string;
  /** Lowercased wallet address, exposed to policies as a custom claim. */
  wallet: string;
}

/**
 * Mints a short-lived Supabase RLS JWT (HS256, signed with the project JWT
 * secret) for use by the browser read-only client. Postgres sees
 * auth.uid() = userId and role 'authenticated'.
 */
export async function mintRlsJwt({ userId, wallet }: MintRlsJwtInput): Promise<string> {
  const secret = new TextEncoder().encode(serverEnv.supabaseJwtSecret);
  return new SignJWT({ role: 'authenticated', wallet: wallet.toLowerCase() })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime(RLS_JWT_TTL)
    .sign(secret);
}
