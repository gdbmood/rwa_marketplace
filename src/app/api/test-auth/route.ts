import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import { type LoginPayload, createAuth } from 'thirdweb/auth';
import { privateKeyToAccount } from 'thirdweb/wallets';
import { client } from '@/lib/thirdWebClient';
import { publicEnv, serverEnv } from '@/lib/env';
import { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from '@/lib/auth/session';
import { upsertUserOnLogin } from '@/lib/db/users';

/**
 * POST /api/test-auth  { wallet: string, type?: 'retail' | 'business' }
 *
 * Test-mode only login: issues the same session cookie as the production
 * login action without requiring a wallet signature, so Playwright can
 * authenticate. Guarded twice: it 404s unless TEST_MODE=1, and it 404s on
 * Vercel regardless. Creates the users row when missing.
 */

const WALLET_PATTERN = /^0x[0-9a-fA-F]{40}$/;

function testModeEnabled(): boolean {
  return process.env.TEST_MODE === '1' && process.env.VERCEL !== '1';
}

type GeneratedJwtPayload = Parameters<
  ReturnType<typeof createAuth>['generateJWT']
>[0]['payload'];

export async function POST(req: NextRequest) {
  if (!testModeEnabled()) {
    return new Response('Not found', { status: 404 });
  }

  let body: { wallet?: unknown; type?: unknown };
  try {
    body = (await req.json()) as { wallet?: unknown; type?: unknown };
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const wallet = typeof body.wallet === 'string' ? body.wallet.trim() : '';
  if (!WALLET_PATTERN.test(wallet)) {
    return Response.json({ error: 'wallet must be a wallet address' }, { status: 400 });
  }
  const type = body.type === 'business' ? 'business' : 'retail';

  try {
    const user = await upsertUserOnLogin(wallet, type);

    const auth = createAuth({
      domain: publicEnv.thirdwebAuthDomain,
      adminAccount: privateKeyToAccount({ client, privateKey: serverEnv.authPrivateKey }),
      client,
    });

    const now = new Date();
    const loginPayload: LoginPayload = {
      domain: publicEnv.thirdwebAuthDomain,
      address: wallet,
      statement: 'Test mode session',
      version: '1',
      nonce: randomUUID(),
      issued_at: now.toISOString(),
      expiration_time: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
      invalid_before: now.toISOString(),
    };

    // generateJWT only signs over the payload; the branded "verified" type
    // exists to keep production code from skipping verifyPayload. Skipping it
    // is exactly the point of this guarded test-only route.
    const jwt = await auth.generateJWT({
      payload: loginPayload as GeneratedJwtPayload,
      context: { walletAddress: wallet },
    });

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, jwt, SESSION_COOKIE_OPTIONS);

    return Response.json({ ok: true, wallet: user.wallet_address, type: user.type });
  } catch (error) {
    console.error('[test-auth]', error instanceof Error ? error.message : error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
