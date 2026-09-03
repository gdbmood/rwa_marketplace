'use server';

import { type VerifyLoginPayloadParams, createAuth } from 'thirdweb/auth';
import { privateKeyToAccount } from 'thirdweb/wallets';
import { cookies } from 'next/headers';
import { client } from '@/lib/thirdWebClient';
import { publicEnv, serverEnv } from '@/lib/env';
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  verifySessionJwt,
} from '@/lib/auth/session';
import { type UserType, upsertUserOnLogin } from '@/lib/db/users';
import { type ActionResult, err, ok, toActionError } from '@/actions/result';

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

/** SIWE login payload for the connect flow. Raw shape, consumed by thirdweb. */
export async function generatePayload(address: string) {
  return getThirdwebAuth().generatePayload({
    chainId: publicEnv.thirdwebChainId,
    address,
  });
}

/**
 * Verifies the signed SIWE payload, upserts the users row (lowercased wallet,
 * last_login_at bumped) and sets the hardened session cookie. The stored user
 * type is fixed at first login; later logins never change it.
 */
export async function login(
  payload: VerifyLoginPayloadParams,
  userType: UserType = 'retail',
): Promise<ActionResult<{ wallet: string }>> {
  try {
    const auth = getThirdwebAuth();
    const verifiedPayload = await auth.verifyPayload(payload);
    if (!verifiedPayload.valid) {
      return err('unauthenticated', 'Invalid login signature');
    }

    const address = verifiedPayload.payload.address;
    const type = userType === 'business' ? 'business' : 'retail';
    const user = await upsertUserOnLogin(address, type);

    const jwt = await auth.generateJWT({
      payload: verifiedPayload.payload,
      context: { walletAddress: address },
    });

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, jwt, SESSION_COOKIE_OPTIONS);

    return ok({ wallet: user.wallet_address });
  } catch (error) {
    return toActionError(error, 'login');
  }
}

/**
 * True only when the session cookie carries a valid, unexpired JWT. When an
 * address is provided (thirdweb passes the connected wallet) it must match
 * the session wallet, so a stale cookie for another wallet reads logged out.
 */
export async function isLoggedIn(address?: string): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const jwt = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!jwt) {
      return false;
    }
    const session = await verifySessionJwt(jwt);
    if (!session) {
      return false;
    }
    if (address && session.wallet !== address.toLowerCase()) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
