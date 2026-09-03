import { createHmac } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { publicEnv, serverEnv } from '@/lib/env';
import { insertChainEvent } from '@/lib/db/chainEvents';
import { createIndexerChainContext, decodeKnownLog } from '@/lib/indexer/chain';
import { createIndexerDeps } from '@/lib/indexer/deps';
import { processPendingEvents } from '@/lib/indexer/ingest';
import { internalErrorResponse, safeEqual, unauthorizedResponse } from '@/lib/indexer/auth';

/**
 * Push-based ingestion for thirdweb Insight style webhooks. The polling cron
 * (/api/indexer/run) remains the source of completeness; this route only
 * lowers latency. Both paths write chain_events idempotently on
 * (chain_id, tx_hash, log_index), so double delivery is harmless.
 *
 * Authentication, one of:
 *   - x-payload-signature: hex HMAC-SHA256 of the raw request body keyed with
 *     CHAIN_WEBHOOK_SECRET (thirdweb Insight webhook signature scheme),
 *   - Authorization: Bearer <CHAIN_WEBHOOK_SECRET>,
 *   - x-webhook-secret: <CHAIN_WEBHOOK_SECRET>.
 *
 * Expected payload shape (tolerant parser; thirdweb Insight event webhook):
 *
 *   {
 *     "data": [
 *       {
 *         "type": "event",
 *         "status": "new",                      // "reverted" entries are ignored
 *         "data": {
 *           "chain_id": "84532",                // string or number
 *           "block_number": 12345678,
 *           "transaction_hash": "0x...",
 *           "log_index": 3,
 *           "address": "0x...",                 // emitting contract
 *           "topics": ["0x...", "..."],
 *           "data": "0x..."                     // ABI-encoded non-indexed args
 *         }
 *       }
 *     ]
 *   }
 *
 * A flat { "events": [ { ...same fields... } ] } body is accepted too. Every
 * entry is re-decoded locally from topics/data against the four known event
 * layouts (NFTFractionalized, FractionBought, RoyaltyDistributed, ERC20
 * Transfer); entries that do not decode are counted as rejected and never
 * stored, so the payload cannot plant malformed rows.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface WebhookEntry {
  chainId: number;
  contractAddress: string;
  txHash: string;
  blockNumber: number;
  logIndex: number;
  topics: string[];
  data: string;
}

function isAuthorized(request: NextRequest, rawBody: string): boolean {
  let secret: string;
  try {
    secret = serverEnv.chainWebhookSecret;
  } catch {
    // Fail closed when CHAIN_WEBHOOK_SECRET is not configured.
    return false;
  }

  const signature = request.headers.get('x-payload-signature');
  if (signature) {
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    return safeEqual(signature.toLowerCase().replace(/^0x/, ''), expected);
  }

  const authorization = request.headers.get('authorization');
  if (authorization && authorization.toLowerCase().startsWith('bearer ')) {
    return safeEqual(authorization.slice(7).trim(), secret);
  }
  const headerSecret = request.headers.get('x-webhook-secret');
  return headerSecret !== null && safeEqual(headerSecret, secret);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isSafeInteger(value)) {
      return value;
    }
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
      const parsed = Number.parseInt(value.trim(), 10);
      if (Number.isSafeInteger(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return null;
}

function parseEntry(raw: unknown, defaultChainId: number): WebhookEntry | null {
  const outer = asRecord(raw);
  if (!outer) {
    return null;
  }
  if (typeof outer.status === 'string' && outer.status === 'reverted') {
    return null;
  }
  // Insight wraps the log under "data"; flat payloads carry it directly.
  const log = asRecord(outer.data) ?? outer;

  const chainId = pickNumber(log, ['chain_id', 'chainId']) ?? defaultChainId;
  const blockNumber = pickNumber(log, ['block_number', 'blockNumber']);
  const logIndex = pickNumber(log, ['log_index', 'logIndex']);
  const txHash = pickString(log, ['transaction_hash', 'transactionHash', 'tx_hash', 'txHash']);
  const address = pickString(log, ['address', 'contract_address', 'contractAddress']);
  const data = pickString(log, ['data']) ?? '0x';
  const topicsRaw = log.topics;
  const topics = Array.isArray(topicsRaw)
    ? topicsRaw.filter((t): t is string => typeof t === 'string')
    : [];

  if (blockNumber === null || logIndex === null || !txHash || !address || topics.length === 0) {
    return null;
  }
  return {
    chainId,
    contractAddress: address.toLowerCase(),
    txHash,
    blockNumber,
    logIndex,
    topics,
    data,
  };
}

export async function POST(request: NextRequest): Promise<Response> {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return Response.json(
      { ok: false, error: { code: 'invalid_input', message: 'Unreadable request body' } },
      { status: 400 },
    );
  }

  if (!isAuthorized(request, rawBody)) {
    return unauthorizedResponse();
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json(
      { ok: false, error: { code: 'invalid_input', message: 'Body is not valid JSON' } },
      { status: 400 },
    );
  }

  const body = asRecord(payload);
  const entriesRaw: unknown[] =
    body && Array.isArray(body.data)
      ? body.data
      : body && Array.isArray(body.events)
        ? body.events
        : [];

  try {
    const defaultChainId = publicEnv.thirdwebChainId;
    let received = 0;
    let stored = 0;
    let rejected = 0;

    for (const raw of entriesRaw) {
      received += 1;
      const entry = parseEntry(raw, defaultChainId);
      if (!entry) {
        rejected += 1;
        continue;
      }
      // Re-decode locally: only the four known event layouts are ever stored,
      // and always in the same normalized shape the polling ingest produces.
      const decoded = decodeKnownLog(entry.topics, entry.data);
      if (!decoded) {
        rejected += 1;
        continue;
      }
      const result = await insertChainEvent({
        chainId: entry.chainId,
        contractAddress: entry.contractAddress,
        eventName: decoded.eventName,
        txHash: entry.txHash,
        blockNumber: entry.blockNumber,
        logIndex: entry.logIndex,
        args: decoded.args,
      });
      if (result.inserted) {
        stored += 1;
      }
    }

    // Trigger processing so pushed events settle without waiting for the cron.
    const ctx = createIndexerChainContext();
    const deps = createIndexerDeps(ctx);
    const processCounts = await processPendingEvents(deps, ctx.chainId);

    return Response.json({
      ok: true,
      data: { received, stored, rejected, ...processCounts },
    });
  } catch (error) {
    console.error('chain webhook failed:', error);
    return internalErrorResponse(error);
  }
}
