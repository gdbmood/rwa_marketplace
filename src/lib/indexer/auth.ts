import 'server-only';

import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { serverEnv } from '@/lib/env';

/**
 * Shared-secret guard for the indexer endpoints. Accepts either
 *   Authorization: Bearer <CHAIN_WEBHOOK_SECRET>
 *   x-webhook-secret: <CHAIN_WEBHOOK_SECRET>
 * and, when CRON_SECRET is configured (Vercel attaches it to cron requests as
 * a bearer token automatically), that value too.
 */

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

function presentedSecret(request: NextRequest): string | null {
  const authorization = request.headers.get('authorization');
  if (authorization && authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }
  return request.headers.get('x-webhook-secret');
}

export function isAuthorizedIndexerRequest(request: NextRequest): boolean {
  const presented = presentedSecret(request);
  if (!presented) {
    return false;
  }
  let secrets: string[];
  try {
    secrets = [serverEnv.chainWebhookSecret];
  } catch {
    // Fail closed when CHAIN_WEBHOOK_SECRET is not configured.
    return false;
  }
  if (process.env.CRON_SECRET) {
    secrets.push(process.env.CRON_SECRET);
  }
  return secrets.some((secret) => safeEqual(presented, secret));
}

export function unauthorizedResponse(): Response {
  return Response.json(
    { ok: false, error: { code: 'forbidden', message: 'Invalid or missing indexer secret' } },
    { status: 401 },
  );
}

export function internalErrorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return Response.json(
    { ok: false, error: { code: 'internal', message } },
    { status: 500 },
  );
}
