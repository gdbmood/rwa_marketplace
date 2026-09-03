import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { publicEnv } from '@/lib/env';
import { getOrderById, transitionOrder } from '@/lib/db/orders';
import { createOnrampSession } from '@/lib/db/onramp';
import { writeAudit } from '@/lib/db/audit';
import { getOnrampProvider } from '@/lib/onramp';
import { addUsdc } from '@/lib/onramp/usdc';
import { errorResponse, jsonError, jsonOk } from '@/lib/onramp/http';

/**
 * POST /api/onramp/create
 * Body: { orderId: string, fiatCurrency?: string }
 *
 * Starts a fiat on-ramp for an order the caller owns that is still in
 * created status. Creates the provider session, persists the
 * onramp_sessions row and moves the order to awaiting_funds. The response
 * sessionId is the provider session id; poll GET /api/onramp/status with it.
 */

const FIAT_CURRENCY_PATTERN = /^[A-Za-z]{3}$/;
const DEFAULT_FIAT_CURRENCY = 'USD';

interface CreateBody {
  orderId?: unknown;
  fiatCurrency?: unknown;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireUser();

    let body: CreateBody;
    try {
      body = (await request.json()) as CreateBody;
    } catch {
      return jsonError('invalid_input', 'Request body must be JSON');
    }

    const orderId = body.orderId;
    if (typeof orderId !== 'string' || orderId.length === 0) {
      return jsonError('invalid_input', 'orderId is required');
    }

    let fiatCurrency = DEFAULT_FIAT_CURRENCY;
    if (body.fiatCurrency !== undefined) {
      if (
        typeof body.fiatCurrency !== 'string' ||
        !FIAT_CURRENCY_PATTERN.test(body.fiatCurrency)
      ) {
        return jsonError('invalid_input', 'fiatCurrency must be a 3-letter ISO 4217 code');
      }
      fiatCurrency = body.fiatCurrency.toUpperCase();
    }

    const order = await getOrderById(orderId);
    if (!order) {
      return jsonError('not_found', 'Order not found');
    }
    if (order.buyer_id !== user.id) {
      return jsonError('forbidden', 'Order belongs to another user');
    }
    if (order.status !== 'created') {
      return jsonError(
        'conflict',
        `Order is ${order.status}; an on-ramp can only be started for a created order`,
      );
    }

    // The buyer must receive enough USDC to cover the fills plus the platform
    // fee. Amounts come from the order row, never from the client.
    const tokenAmount = addUsdc(order.quoted_total, order.platform_fee);

    const provider = getOnrampProvider();
    const session = await provider.createSession({
      userId: user.id,
      orderId: order.id,
      wallet: user.wallet_address,
      fiatCurrency,
      tokenAmount,
      chainId: publicEnv.thirdwebChainId,
    });

    // Plain literal so the shape satisfies the Json column type.
    const quoteJson = {
      fiatCurrency: session.quote.fiatCurrency,
      fiatAmount: session.quote.fiatAmount,
      tokenAmount: session.quote.tokenAmount,
    };

    const row = await createOnrampSession({
      userId: user.id,
      provider: provider.name,
      providerSessionId: session.providerSessionId,
      orderId: order.id,
      fiatCurrency: session.quote.fiatCurrency,
      fiatAmount: session.quote.fiatAmount,
      tokenAmount: session.quote.tokenAmount,
      rawPayload: { quote: quoteJson },
    });

    const moved = await transitionOrder(order.id, ['created'], 'awaiting_funds', {
      payment_method: 'onramp',
    });
    if (!moved) {
      return jsonError('conflict', 'Order state changed while creating the on-ramp session');
    }

    await writeAudit({
      actorUserId: user.id,
      action: 'onramp.session_created',
      entity: 'onramp_sessions',
      entityId: row.id,
      diff: { orderId: order.id, provider: provider.name, quote: quoteJson },
    });

    return jsonOk({
      sessionId: session.providerSessionId,
      onrampSessionId: row.id,
      orderId: order.id,
      orderStatus: moved.status,
      status: row.status,
      redirectUrl: session.redirectUrl ?? null,
      widgetData: session.widgetData ?? null,
      quote: session.quote,
    });
  } catch (error) {
    return errorResponse(error, 'onramp.create');
  }
}
