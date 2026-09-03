import { NextRequest, NextResponse } from 'next/server';
import { getOnrampSessionByProviderId } from '@/lib/db/onramp';
import { getOnrampProvider } from '@/lib/onramp';
import { OnrampProviderError } from '@/lib/onramp/types';
import { isTerminalOnrampStatus } from '@/lib/onramp/statusMap';
import { applyOnrampStatus } from '@/lib/onramp/settlement';
import { jsonError, jsonOk } from '@/lib/onramp/http';

/**
 * POST /api/onramp/webhook
 *
 * Provider callback. Authentication is the provider's webhook signature,
 * verified inside provider.parseWebhook (thirdweb: x-payload HMAC via
 * THIRDWEB_WEBHOOK_SECRET). Idempotent: replays of a terminal session and
 * events for unknown sessions are acknowledged without writes, and the order
 * transition inside applyOnrampStatus is guarded so a webhook racing the
 * status poll settles the order exactly once.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const provider = getOnrampProvider();

    let event;
    try {
      event = await provider.parseWebhook(request);
    } catch (error) {
      if (error instanceof OnrampProviderError) {
        // Bad signature or malformed payload: reject so a misconfigured
        // secret is visible in provider delivery logs.
        return jsonError('provider_error', error.message, 401);
      }
      throw error;
    }

    if (!event) {
      // Not an on-ramp session event; acknowledge so the provider stops
      // retrying.
      return jsonOk({ received: true, handled: false });
    }

    const session = await getOnrampSessionByProviderId(event.providerSessionId);
    if (!session) {
      console.warn(
        `onramp.webhook: event for unknown session "${event.providerSessionId}" ignored`,
      );
      return jsonOk({ received: true, handled: false });
    }

    // A terminal session never regresses; late or replayed events are acked.
    if (isTerminalOnrampStatus(session.status)) {
      return jsonOk({ received: true, handled: false });
    }

    const applied = await applyOnrampStatus(session, event.status, {
      wallet: event.wallet,
      txHash: event.txHash,
      raw: event.raw,
    });

    return jsonOk({
      received: true,
      handled: true,
      status: applied.session.status,
      orderId: applied.session.order_id,
    });
  } catch (error) {
    // 500 so the provider retries the delivery.
    console.error('onramp.webhook:', error);
    return jsonError('internal', 'Webhook processing failed');
  }
}
