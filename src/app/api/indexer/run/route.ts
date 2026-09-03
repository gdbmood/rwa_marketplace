import type { NextRequest } from 'next/server';
import { runIngestCycle } from '@/lib/indexer/ingest';
import {
  internalErrorResponse,
  isAuthorizedIndexerRequest,
  unauthorizedResponse,
} from '@/lib/indexer/auth';

/**
 * Cron entry point: runs one bounded ingest cycle (fetch new logs, store them
 * in chain_events, process pending events, reconcile primary listings).
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
    const data = await runIngestCycle();
    return Response.json({ ok: true, data });
  } catch (error) {
    console.error('indexer run failed:', error);
    return internalErrorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  return handle(request);
}

export async function GET(request: NextRequest): Promise<Response> {
  return handle(request);
}
