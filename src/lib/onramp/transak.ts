import 'server-only';

import {
  type OnrampProvider,
  OnrampProviderError,
  type OnrampSessionStatus,
  type OnrampWebhookEvent,
} from '@/lib/onramp/types';

/**
 * NOT IMPLEMENTED: Transak fallback stub.
 *
 * Transak supports UAE users and AED card payments directly, which thirdweb's
 * hosted on-ramp currently excludes (see docs/architecture/ONRAMP.md). If the
 * thirdweb path proves unusable for the UAE launch market, this provider gets
 * a real implementation behind the exact same OnrampProvider interface and
 * the routes, repositories and UI do not change.
 *
 * A real implementation would need these env vars (none are read yet):
 *   TRANSAK_API_KEY          partner API key from the Transak dashboard
 *   TRANSAK_API_SECRET       partner API secret, used to refresh access tokens
 *   TRANSAK_ENVIRONMENT      "STAGING" or "PRODUCTION"
 *   TRANSAK_WEBHOOK_SECRET   webhook signing secret for ORDER_* event payloads
 *
 * Sketch: createSession builds a hosted widget URL (global-stg.transak.com or
 * global.transak.com) with apiKey, walletAddress, cryptoCurrencyCode=USDC,
 * network, fiatCurrency, fiatAmount and partnerOrderId=orders.id, using the
 * partnerOrderId as the provider session key until the ORDER_CREATED webhook
 * delivers Transak's order id. getSessionStatus polls the partner orders API.
 * parseWebhook verifies the signed webhook and maps ORDER_PAYMENT_VERIFYING
 * to pending, ORDER_COMPLETED to completed, ORDER_FAILED to failed and
 * ORDER_CANCELLED to canceled.
 */

function notImplemented(): never {
  throw new OnrampProviderError(
    'provider_error',
    'Transak on-ramp provider is not implemented. Use the thirdweb provider, or implement src/lib/onramp/transak.ts per docs/architecture/ONRAMP.md.',
  );
}

export const transakOnrampProvider: OnrampProvider = {
  name: 'transak',
  async createSession(): Promise<never> {
    notImplemented();
  },
  async getSessionStatus(): Promise<OnrampSessionStatus> {
    notImplemented();
  },
  async parseWebhook(): Promise<OnrampWebhookEvent | null> {
    // Unverifiable without TRANSAK_WEBHOOK_SECRET handling; refuse loudly
    // rather than silently ignoring a provider callback.
    notImplemented();
  },
};
