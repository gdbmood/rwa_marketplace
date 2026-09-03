/**
 * Provider-agnostic fiat on-ramp contract. Every provider (thirdweb, mock,
 * and the Transak fallback stub) implements OnrampProvider so the API routes
 * and the buy flow never depend on a specific vendor.
 *
 * Statuses are exactly the onramp_status database enum, so a provider status
 * can be written to onramp_sessions.status without translation.
 */

import type { Database, Json } from '@/types/database';

export type OnrampSessionStatus = Database['public']['Enums']['onramp_status'];

export interface CreateOnrampSessionInput {
  /** users.id of the buyer. */
  userId: string;
  /** orders.id the on-ramp funds. */
  orderId: string;
  /** Destination wallet that receives the USDC. */
  wallet: string;
  /** ISO 4217 code the buyer pays in, e.g. USD or AED. */
  fiatCurrency: string;
  /** Optional fiat amount hint in fiatCurrency units, numeric string. */
  fiatAmount?: string;
  /** Required USDC amount in USDC units (not micro), numeric string. */
  tokenAmount: string;
  /** Destination chain id for the USDC. */
  chainId: number;
}

export interface OnrampQuote {
  fiatCurrency: string;
  /** Fiat the buyer pays, numeric string in fiatCurrency units. Null when the provider quotes later. */
  fiatAmount: string | null;
  /** USDC delivered, numeric string in USDC units. */
  tokenAmount: string;
}

export interface CreateOnrampSessionResult {
  /** The provider's own session id, stored in onramp_sessions.provider_session_id. */
  providerSessionId: string;
  /** Hosted checkout URL to redirect the buyer to, when the provider is redirect based. */
  redirectUrl?: string;
  /** Provider payload for an embedded widget, when the provider is widget based. */
  widgetData?: Json;
  quote: OnrampQuote;
}

export interface OnrampWebhookEvent {
  providerSessionId: string;
  status: OnrampSessionStatus;
  /** Receiving wallet when the provider reports it. */
  wallet?: string;
  /** On-chain delivery transaction hash when the provider reports it. */
  txHash?: string;
  /** JSON-safe copy of the provider payload, persisted to raw_payload. */
  raw: Json;
}

export interface OnrampProvider {
  /** Stored in onramp_sessions.provider. */
  readonly name: string;
  createSession(input: CreateOnrampSessionInput): Promise<CreateOnrampSessionResult>;
  /** Polls the provider and returns the normalized session status. */
  getSessionStatus(providerSessionId: string): Promise<OnrampSessionStatus>;
  /**
   * Verifies and parses a provider webhook request. Returns null for events
   * that are not on-ramp session updates. Throws OnrampProviderError with
   * code provider_error when the signature or payload is invalid.
   */
  parseWebhook(request: Request): Promise<OnrampWebhookEvent | null>;
}

export type OnrampErrorCode = 'provider_error' | 'invalid_input' | 'not_found';

export class OnrampProviderError extends Error {
  constructor(
    readonly code: OnrampErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'OnrampProviderError';
  }
}
