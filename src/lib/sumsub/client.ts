import 'server-only';

import { createHmac, timingSafeEqual } from 'crypto';
import { serverEnv } from '@/lib/env';

const SUMSUB_BASE_URL = 'https://api.sumsub.com';

/** Sumsub verification levels the app is allowed to open sessions for. */
export const SUMSUB_LEVELS = ['id-only', 'id-and-liveness'] as const;
export type SumsubLevel = (typeof SUMSUB_LEVELS)[number];

export class SumsubApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'SumsubApiError';
  }
}

interface SumsubRequestOptions {
  method: 'GET' | 'POST';
  /** Path including any query string; it is part of the signed material. */
  path: string;
  body?: unknown;
}

/**
 * Signed Sumsub API request. Every request carries X-App-Access-Ts and an
 * HMAC-SHA256 X-App-Access-Sig over ts + METHOD + path + body, computed with
 * a per-request config (no shared mutable state, no global interceptors).
 */
async function sumsubRequest<T>(options: SumsubRequestOptions): Promise<T> {
  const ts = Math.floor(Date.now() / 1000).toString();
  const bodyString = options.body !== undefined ? JSON.stringify(options.body) : '';
  const signature = createHmac('sha256', serverEnv.sumsubSecretKey)
    .update(ts + options.method + options.path + bodyString)
    .digest('hex');

  const response = await fetch(`${SUMSUB_BASE_URL}${options.path}`, {
    method: options.method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-App-Token': serverEnv.sumsubToken,
      'X-App-Access-Ts': ts,
      'X-App-Access-Sig': signature,
    },
    body: bodyString || undefined,
    cache: 'no-store',
  });

  if (!response.ok) {
    // Never log or rethrow headers; status and a body snippet are enough.
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    throw new SumsubApiError(response.status, `Sumsub API ${response.status}: ${detail}`);
  }
  return (await response.json()) as T;
}

/**
 * Creates a Sumsub WebSDK access token for the given external user id (the
 * lowercased wallet address) at the given level.
 */
export async function createSdkAccessToken(
  externalUserId: string,
  levelName: SumsubLevel,
  ttlInSecs = 600,
): Promise<string> {
  const data = await sumsubRequest<{ token?: string }>({
    method: 'POST',
    path: '/resources/accessTokens/sdk',
    body: { userId: externalUserId, levelName, ttlInSecs },
  });
  if (!data.token) {
    throw new SumsubApiError(502, 'Sumsub returned no access token');
  }
  return data.token;
}

const DIGEST_ALGORITHMS: Record<string, string> = {
  HMAC_SHA1_HEX: 'sha1',
  HMAC_SHA256_HEX: 'sha256',
  HMAC_SHA512_HEX: 'sha512',
};

/**
 * Verifies the x-payload-digest webhook header: an HMAC over the raw request
 * body keyed with SUMSUB_WEBHOOK_SECRET, using the algorithm announced in
 * x-payload-digest-alg (all supported algorithms are tried when the header is
 * absent). Constant-time comparison.
 */
export function verifyWebhookDigest(
  rawBody: string,
  digestHeader: string | null,
  algorithmHeader: string | null,
): boolean {
  if (!digestHeader) {
    return false;
  }
  const secret = serverEnv.sumsubWebhookSecret;
  const algorithms = algorithmHeader
    ? [DIGEST_ALGORITHMS[algorithmHeader]].filter(Boolean)
    : Object.values(DIGEST_ALGORITHMS);
  if (algorithms.length === 0) {
    return false;
  }

  let provided: Buffer;
  try {
    provided = Buffer.from(digestHeader, 'hex');
  } catch {
    return false;
  }

  for (const algorithm of algorithms) {
    const expected = createHmac(algorithm, secret).update(rawBody).digest();
    if (expected.length === provided.length && timingSafeEqual(expected, provided)) {
      return true;
    }
  }
  return false;
}
