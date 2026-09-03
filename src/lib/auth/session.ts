import 'server-only';

import { cookies } from 'next/headers';
import { createAuth } from 'thirdweb/auth';
import { privateKeyToAccount } from 'thirdweb/wallets';
import { client } from '@/lib/thirdWebClient';
import { publicEnv, serverEnv } from '@/lib/env';
import { getUserByWallet, type UserRow } from '@/lib/db/users';

export const SESSION_COOKIE_NAME = 'jwt';

/** Cookie options for the session JWT, to be used by the login action. */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
} as const;

export type AuthErrorCode = 'unauthenticated' | 'not_found';

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'AuthError';
  }
}

let thirdwebAuth: ReturnType<typeof createAuth> | null = null;

function getThirdwebAuth(): ReturnType<typeof createAuth> {
  if (!thirdwebAuth) {
    thirdwebAuth = createAuth({
      domain: publicEnv.thirdwebAuthDomain,
      adminAccount: privateKeyToAccount({ client, privateKey: serverEnv.authPrivateKey }),
      client,
    });
  }
  return thirdwebAuth;
}

export interface VerifiedSession {
  /** Lowercased wallet address from the verified JWT. */
  wallet: string;
}

/**
 * Verifies a session JWT signature and expiry through thirdweb's verifyJWT
 * (never jose.decodeJwt, which skips signature checks) and extracts the
 * wallet address from the ctx claim, falling back to sub.
 */
export async function verifySessionJwt(jwt: string): Promise<VerifiedSession | null> {
  const auth = getThirdwebAuth();
  const result = await auth.verifyJWT({ jwt });
  if (!result.valid) {
    return null;
  }
  const ctx = result.parsedJWT.ctx as { walletAddress?: unknown } | undefined;
  const wallet =
    typeof ctx?.walletAddress === 'string' ? ctx.walletAddress : result.parsedJWT.sub;
  if (!wallet) {
    return null;
  }
  return { wallet: wallet.toLowerCase() };
}

/** Reads and verifies the session cookie. Null when absent or invalid. */
export async function getSessionWallet(): Promise<string | null> {
  const cookieStore = await cookies();
  const jwt = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!jwt) {
    return null;
  }
  const session = await verifySessionJwt(jwt);
  return session?.wallet ?? null;
}

/**
 * Verifies the session and loads the matching users row. Throws AuthError
 * with code 'unauthenticated' when the JWT is missing or invalid, and
 * 'not_found' when no users row exists for the wallet.
 */
export async function requireUser(): Promise<{ user: UserRow; wallet: string }> {
  const wallet = await getSessionWallet();
  if (!wallet) {
    throw new AuthError('unauthenticated', 'No valid session JWT');
  }
  const user = await getUserByWallet(wallet);
  if (!user) {
    throw new AuthError('not_found', `No user found for wallet ${wallet}`);
  }
  return { user, wallet };
}
