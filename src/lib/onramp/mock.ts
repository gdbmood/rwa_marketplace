import 'server-only';

import { randomUUID } from 'crypto';
import type { Json } from '@/types/database';
import { getOnrampSessionByProviderId } from '@/lib/db/onramp';
import { parseNumeric } from '@/lib/db/numeric';
import { nextMockStatus } from '@/lib/onramp/statusMap';
import {
  type CreateOnrampSessionInput,
  type CreateOnrampSessionResult,
  type OnrampProvider,
  OnrampProviderError,
  type OnrampSessionStatus,
  type OnrampWebhookEvent,
} from '@/lib/onramp/types';

/**
 * TEST_MODE provider: no external calls, deterministic transitions. State
 * lives in the onramp_sessions row, so successive polls of the status
 * endpoint advance created to pending to completed. A session created with
 * the magic fiat amount below fails on the poll after pending instead.
 *
 * The redirect URL points at a local page (WS4 owns /onramp/mock) so e2e
 * flows can follow the same redirect shape as the real provider.
 */

export const MOCK_PROVIDER_NAME = 'mock';
export const MOCK_SESSION_ID_PREFIX = 'mock_';
export const MOCK_FAIL_FIAT_AMOUNT = 13;

const MOCK_STATUSES: readonly OnrampSessionStatus[] = [
  'created',
  'pending',
  'completed',
  'failed',
  'canceled',
];

async function createSession(
  input: CreateOnrampSessionInput,
): Promise<CreateOnrampSessionResult> {
  const providerSessionId = `${MOCK_SESSION_ID_PREFIX}${randomUUID()}`;
  return {
    providerSessionId,
    redirectUrl: `/onramp/mock?session=${providerSessionId}`,
    quote: {
      fiatCurrency: input.fiatCurrency,
      // 1:1 fiat to USDC unless the caller pinned a fiat amount (the magic
      // failing amount arrives through this path in tests).
      fiatAmount: input.fiatAmount ?? input.tokenAmount,
      tokenAmount: input.tokenAmount,
    },
  };
}

async function getSessionStatus(providerSessionId: string): Promise<OnrampSessionStatus> {
  const row = await getOnrampSessionByProviderId(providerSessionId);
  if (!row) {
    throw new OnrampProviderError(
      'not_found',
      `Unknown mock onramp session "${providerSessionId}"`,
    );
  }
  const forceFail = parseNumeric(row.fiat_amount) === MOCK_FAIL_FIAT_AMOUNT;
  return nextMockStatus(row.status, forceFail);
}

/**
 * Accepts a plain JSON POST of { providerSessionId, status } so e2e tests can
 * force a transition without polling. Anything else is ignored.
 */
async function parseWebhook(request: Request): Promise<OnrampWebhookEvent | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const payload = body as Record<string, unknown>;
  const providerSessionId = payload.providerSessionId;
  const status = payload.status;
  if (typeof providerSessionId !== 'string' || providerSessionId.length === 0) {
    return null;
  }
  if (
    typeof status !== 'string' ||
    !(MOCK_STATUSES as readonly string[]).includes(status)
  ) {
    return null;
  }
  return {
    providerSessionId,
    status: status as OnrampSessionStatus,
    wallet: typeof payload.wallet === 'string' ? payload.wallet : undefined,
    txHash: typeof payload.txHash === 'string' ? payload.txHash : undefined,
    raw: payload as Json,
  };
}

export const mockOnrampProvider: OnrampProvider = {
  name: MOCK_PROVIDER_NAME,
  createSession,
  getSessionStatus,
  parseWebhook,
};
