import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { getOnrampSessionByProviderId, type OnrampSessionRow } from '@/lib/db/onramp';
import { getOrderById, type OrderRow } from '@/lib/db/orders';
import { getOnrampProvider } from '@/lib/onramp';
import { isTerminalOnrampStatus } from '@/lib/onramp/statusMap';
import { applyOnrampStatus } from '@/lib/onramp/settlement';
import { errorResponse, jsonError, jsonOk } from '@/lib/onramp/http';

/**
 * GET /api/onramp/status?sessionId=<providerSessionId>
 *
 * Returns the current on-ramp session status for a session the caller owns.
 * While the session is not terminal the provider is polled and the row is
 * updated; a completed session moves the linked order created|awaiting_funds
 * to funded and records the onramp transactions row (see settlement.ts).
 */

interface StatusData {
  sessionId: string | null;
  onrampSessionId: string;
  status: OnrampSessionRow['status'];
  provider: string;
  orderId: string | null;
  orderStatus: OrderRow['status'] | null;
  failureReason: string | null;
}

async function toStatusData(
  session: OnrampSessionRow,
  order: OrderRow | null,
): Promise<StatusData> {
  let resolvedOrder = order;
  if (!resolvedOrder && session.order_id) {
    resolvedOrder = await getOrderById(session.order_id);
  }
  return {
    sessionId: session.provider_session_id,
    onrampSessionId: session.id,
    status: session.status,
    provider: session.provider,
    orderId: session.order_id,
    orderStatus: resolvedOrder?.status ?? null,
    failureReason: resolvedOrder?.failure_reason ?? null,
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireUser();

    const sessionId = request.nextUrl.searchParams.get('sessionId');
    if (!sessionId) {
      return jsonError('invalid_input', 'sessionId query parameter is required');
    }

    const session = await getOnrampSessionByProviderId(sessionId);
    if (!session) {
      return jsonError('not_found', 'On-ramp session not found');
    }
    if (session.user_id !== user.id) {
      return jsonError('forbidden', 'On-ramp session belongs to another user');
    }

    // Terminal sessions are settled; report without touching the provider.
    if (isTerminalOnrampStatus(session.status)) {
      return jsonOk(await toStatusData(session, null));
    }

    const provider = getOnrampProvider();
    if (session.provider !== provider.name) {
      return jsonError(
        'provider_error',
        `Session was created by the "${session.provider}" provider, which is not active`,
      );
    }

    const providerStatus = await provider.getSessionStatus(sessionId);
    if (providerStatus === session.status) {
      return jsonOk(await toStatusData(session, null));
    }

    const applied = await applyOnrampStatus(session, providerStatus, {
      wallet: user.wallet_address,
    });
    return jsonOk(await toStatusData(applied.session, applied.order));
  } catch (error) {
    return errorResponse(error, 'onramp.status');
  }
}
