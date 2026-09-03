import type { NextRequest } from 'next/server';
import { runOrderSweep } from '@/lib/indexer/sweep';
import {
  internalErrorResponse,
  isAuthorizedIndexerRequest,
  unauthorizedResponse,
} from '@/lib/indexer/auth';

/**
 * Cron entry point: expires stale orders (created, awaiting_funds or funded
 * past expires_at) and fails submitted orders older than 2 hours.
 * Guarded by the CHAIN_WEBHOOK_SECRET bearer token (or Vercel's CRON_SECRET).
 * GET is supported because Vercel cron invokes endpoints with GET.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function handle(request: NextRequest): Promise<Response> {
  if (!isAuthorizedIndexerRequest(request)) {
    return unauthorizedResponse();
  }
  try {
    const data = await runOrderSweep();
    return Response.json({ ok: true, data });
  } catch (error) {
    console.error('indexer sweep failed:', error);
    return internalErrorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  return handle(request);
}

export async function GET(request: NextRequest): Promise<Response> {
  return handle(request);
}
