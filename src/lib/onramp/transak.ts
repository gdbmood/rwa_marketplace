import 'server-only';

import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import type { Json } from '@/types/database';
import { serverEnv } from '@/lib/env';
import { toNumericString } from '@/lib/db/numeric';
import { usdcToMicro } from '@/lib/onramp/usdc';
import {
  type CreateOnrampSessionInput,
  type CreateOnrampSessionResult,
  type OnrampProvider,
  OnrampProviderError,
  type OnrampSessionStatus,
  type OnrampWebhookEvent,
} from '@/lib/onramp/types';

/**
 * OnrampProvider over Transak's hosted widget, partner order API and signed
 * webhooks. Selected as the production on-ramp path because thirdweb's hosted
 * on-ramp excludes UAE users (decision recorded in
 * docs/architecture/ONRAMP.md, which also lists exactly which parts of this
 * integration were verified against live Transak docs on 2026-09-03 and which
 * follow the documented model pending partner-account verification).
 *
 * Model:
 * - createSession builds a hosted widget URL (no network call). Our generated
 *   partnerOrderId doubles as the provider session id, so webhooks and status
 *   polls correlate back to the onramp_sessions row without waiting for
 *   Transak to assign its own order id.
 * - getSessionStatus polls GET /partners/api/v2/orders filtered by
 *   partnerOrderId, authenticated with the partner access token minted from
 *   TRANSAK_API_SECRET via POST /partners/api/v2/refresh-token.
 * - parseWebhook verifies the webhook body: Transak posts { data: <JWT> }
 *   where the JWT is HS256-signed with the partner access token. Signature
 *   checks pin HS256 and use a constant-time comparison.
 *
 * Server side only: reads TRANSAK_* env vars lazily via serverEnv so
 * importing this module never touches configuration.
 */

export type TransakEnvironment = 'STAGING' | 'PRODUCTION';

export const TRANSAK_PROVIDER_NAME = 'transak';
export const TRANSAK_SESSION_ID_PREFIX = 'transak_';
export const TRANSAK_CRYPTO_CURRENCY = 'USDC';

/** Fiat currencies the product accepts (decision 2026-09-03: EUR or USD, AED not required). */
export const TRANSAK_SUPPORTED_FIAT: readonly string[] = ['USD', 'EUR'];
export const TRANSAK_DEFAULT_FIAT = 'USD';

/**
 * Base URLs per environment. Staging URLs are verified against live docs;
 * production URLs follow Transak's documented naming convention (see
 * ONRAMP.md section 5 for the verification status of each).
 */
const TRANSAK_HOSTS: Record<TransakEnvironment, { widget: string; api: string }> = {
  STAGING: { widget: 'https://global-stg.transak.com', api: 'https://api-stg.transak.com' },
  PRODUCTION: { widget: 'https://global.transak.com', api: 'https://api.transak.com' },
};

/**
 * Transak network codes by EVM chain id. Transak uses the single code "base"
 * for both mainnet and its staging testnet (staging's crypto coverage lists
 * network "base" with chainId 84532, verified 2026-09-03).
 */
const TRANSAK_NETWORK_BY_CHAIN_ID: Record<number, string> = {
  8453: 'base',
  84532: 'base',
};

/**
 * Transak order statuses onto the onramp_status enum, deliberately
 * conservative: only COMPLETED, FAILED and CANCELLED are terminal. Everything
 * else, including EXPIRED, REFUNDED, ON_HOLD_PENDING_DELIVERY_FROM_TRANSAK
 * and any status Transak adds later, maps to pending so a session is never
 * falsely terminalized; the raw webhook payload persisted on the session row
 * keeps the provider's exact status for ops review.
 *
 * Status list verified against docs.transak.com/guides/track-order-status on
 * 2026-09-03.
 */
const TRANSAK_STATUS_MAP: Record<string, OnrampSessionStatus> = {
  AWAITING_PAYMENT_FROM_USER: 'pending',
  PAYMENT_DONE_MARKED_BY_USER: 'pending',
  PROCESSING: 'pending',
  PENDING_DELIVERY_FROM_TRANSAK: 'pending',
  ON_HOLD_PENDING_DELIVERY_FROM_TRANSAK: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'canceled',
  EXPIRED: 'pending',
  REFUNDED: 'pending',
};

/** Maps a Transak order status onto the onramp_status enum (unknown -> pending). */
export function mapTransakOrderStatus(status: string): OnrampSessionStatus {
  return TRANSAK_STATUS_MAP[status] ?? 'pending';
}

/**
 * Fallback mapping from webhook event ids for payloads whose webhookData
 * carries no status field. Same conservative terminality rules.
 */
const TRANSAK_EVENT_MAP: Record<string, OnrampSessionStatus> = {
  ORDER_CREATED: 'pending',
  ORDER_PAYMENT_VERIFYING: 'pending',
  ORDER_PROCESSING: 'pending',
  ORDER_COMPLETED: 'completed',
  ORDER_FAILED: 'failed',
  ORDER_CANCELLED: 'canceled',
};

export function mapTransakEventId(eventId: string): OnrampSessionStatus {
  return TRANSAK_EVENT_MAP[eventId] ?? 'pending';
}

function getEnvironment(): TransakEnvironment {
  return serverEnv.transakEnvironment;
}

function getWidgetBaseUrl(): string {
  return TRANSAK_HOSTS[getEnvironment()].widget;
}

function getApiBaseUrl(): string {
  return TRANSAK_HOSTS[getEnvironment()].api;
}

function asAddress(value: string, label: string): `0x${string}` {
  const trimmed = value.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    throw new OnrampProviderError('invalid_input', `${label} is not a valid EVM address`);
  }
  return trimmed as `0x${string}`;
}

function transakNetworkForChainId(chainId: number): string {
  const network = TRANSAK_NETWORK_BY_CHAIN_ID[chainId];
  if (!network) {
    throw new OnrampProviderError(
      'provider_error',
      `No Transak network mapping for chain id ${chainId}; supported chains: Base (8453) and Base Sepolia (84532)`,
    );
  }
  return network;
}

/**
 * USD by default; EUR passes through. Any other requested currency falls back
 * to USD instead of failing the session, because the widget locks whatever
 * fiatCurrency it is given and an unsupported code would strand the buyer.
 * The returned quote reflects the currency actually used.
 */
function resolveFiatCurrency(requested: string): string {
  const normalized = requested.trim().toUpperCase();
  return TRANSAK_SUPPORTED_FIAT.includes(normalized) ? normalized : TRANSAK_DEFAULT_FIAT;
}

/** Serializes provider payloads into Json (mirrors the thirdweb provider). */
function toJsonSafe(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_key, val) => (typeof val === 'bigint' ? val.toString() : val)),
  ) as Json;
}

// ---------------------------------------------------------------------------
// Partner access token (used for order polling and webhook verification)
// ---------------------------------------------------------------------------

interface AccessTokenCache {
  token: string;
  /** Unix epoch milliseconds. */
  expiresAtMs: number;
}

let accessTokenCache: AccessTokenCache | null = null;

/** Refresh this long before the reported expiry (token validity is 7 days). */
const ACCESS_TOKEN_SAFETY_MS = 5 * 60 * 1000;

/** Test hook: clears the cached partner access token. */
export function __resetTransakAccessTokenCacheForTests(): void {
  accessTokenCache = null;
}

async function fetchAccessToken(): Promise<AccessTokenCache> {
  const apiKey = serverEnv.transakApiKey;
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}/partners/api/v2/refresh-token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'api-secret': serverEnv.transakApiSecret,
      },
      body: JSON.stringify({ apiKey }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new OnrampProviderError(
      'provider_error',
      `Transak access token request failed: ${message}`,
    );
  }
  if (!response.ok) {
    throw new OnrampProviderError(
      'provider_error',
      `Transak access token request failed with HTTP ${response.status}`,
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new OnrampProviderError(
      'provider_error',
      'Transak access token response is not valid JSON',
    );
  }
  const data =
    typeof body === 'object' && body !== null
      ? (body as { data?: unknown }).data
      : undefined;
  const token =
    typeof data === 'object' && data !== null
      ? (data as { accessToken?: unknown }).accessToken
      : undefined;
  const expiresAt =
    typeof data === 'object' && data !== null
      ? (data as { expiresAt?: unknown }).expiresAt
      : undefined;
  if (typeof token !== 'string' || token.length === 0) {
    throw new OnrampProviderError(
      'provider_error',
      'Transak access token response is missing data.accessToken',
    );
  }
  // expiresAt is a unix timestamp in seconds; fall back to a short lifetime
  // when absent so a malformed response cannot pin a stale token for long.
  const expiresAtMs =
    typeof expiresAt === 'number' && Number.isFinite(expiresAt)
      ? expiresAt * 1000
      : Date.now() + 60 * 60 * 1000;
  return { token, expiresAtMs };
}

async function getAccessToken(forceRefresh = false): Promise<string> {
  if (
    !forceRefresh &&
    accessTokenCache &&
    Date.now() < accessTokenCache.expiresAtMs - ACCESS_TOKEN_SAFETY_MS
  ) {
    return accessTokenCache.token;
  }
  accessTokenCache = await fetchAccessToken();
  return accessTokenCache.token;
}

// ---------------------------------------------------------------------------
// Webhook JWT verification
// ---------------------------------------------------------------------------

/** Internal marker so parseWebhook retries only on signature mismatches. */
class TransakSignatureMismatchError extends OnrampProviderError {
  constructor() {
    super('provider_error', 'Transak webhook signature verification failed');
  }
}

const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * Verifies an HS256 JWT with the given secret and returns the decoded
 * payload. The algorithm is pinned: tokens whose header claims anything other
 * than HS256 (including "none") are rejected outright, and the signature
 * comparison is constant time. Exported for unit tests.
 */
export function verifyTransakWebhookJwt(token: string, secret: string): unknown {
  if (!JWT_SHAPE.test(token)) {
    throw new OnrampProviderError('provider_error', 'Transak webhook payload is not a JWT');
  }
  const [headerB64, payloadB64, signatureB64] = token.split('.');
  let header: unknown;
  try {
    header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
  } catch {
    throw new OnrampProviderError('provider_error', 'Transak webhook JWT header is not valid JSON');
  }
  const alg =
    typeof header === 'object' && header !== null
      ? (header as { alg?: unknown }).alg
      : undefined;
  if (alg !== 'HS256') {
    throw new OnrampProviderError(
      'provider_error',
      'Transak webhook JWT must be signed with HS256',
    );
  }
  const expected = createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest();
  const actual = Buffer.from(signatureB64, 'base64url');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new TransakSignatureMismatchError();
  }
  try {
    return JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    throw new OnrampProviderError(
      'provider_error',
      'Transak webhook JWT payload is not valid JSON',
    );
  }
}

/**
 * Transak posts webhooks as JSON { data: "<jwt>" }; a bare JWT body is also
 * accepted defensively. Anything else is an invalid payload.
 */
function extractWebhookJwt(rawBody: string): string {
  const trimmed = rawBody.trim();
  if (JWT_SHAPE.test(trimmed)) {
    return trimmed;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new OnrampProviderError(
      'provider_error',
      'Transak webhook body is neither JSON nor a JWT',
    );
  }
  if (typeof parsed === 'string' && JWT_SHAPE.test(parsed)) {
    return parsed;
  }
  if (typeof parsed === 'object' && parsed !== null) {
    const data = (parsed as { data?: unknown }).data;
    if (typeof data === 'string' && JWT_SHAPE.test(data)) {
      return data;
    }
  }
  throw new OnrampProviderError(
    'provider_error',
    'Transak webhook body carries no signed data payload',
  );
}

// ---------------------------------------------------------------------------
// OnrampProvider implementation
// ---------------------------------------------------------------------------

async function createSession(
  input: CreateOnrampSessionInput,
): Promise<CreateOnrampSessionResult> {
  const wallet = asAddress(input.wallet, 'wallet');
  const network = transakNetworkForChainId(input.chainId);
  const fiatCurrency = resolveFiatCurrency(input.fiatCurrency);
  try {
    // Validation only: a numeric string with at most 6 decimals, not negative.
    usdcToMicro(input.tokenAmount);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new OnrampProviderError('invalid_input', `tokenAmount is invalid: ${message}`);
  }
  let fiatAmount: string | null = null;
  if (input.fiatAmount !== undefined) {
    try {
      fiatAmount = toNumericString(input.fiatAmount);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new OnrampProviderError('invalid_input', `fiatAmount is invalid: ${message}`);
    }
  }

  // Our correlation id: passed to the widget as partnerOrderId, echoed back in
  // every webhook and usable as the partner API order filter, so it works as
  // the provider session id from the moment the row is inserted.
  const providerSessionId = `${TRANSAK_SESSION_ID_PREFIX}${randomUUID()}`;

  const params = new URLSearchParams({
    apiKey: serverEnv.transakApiKey,
    environment: getEnvironment(),
    fiatCurrency,
    cryptoCurrencyCode: TRANSAK_CRYPTO_CURRENCY,
    network,
    walletAddress: wallet,
    // The USDC must land in the buyer's marketplace wallet; do not let the
    // widget user redirect delivery elsewhere.
    disableWalletAddressForm: 'true',
    partnerOrderId: providerSessionId,
    partnerCustomerId: input.userId,
  });
  if (fiatAmount !== null) {
    // Pre-fill (not lock) the fiat side when the caller supplied a hint.
    params.set('defaultFiatAmount', fiatAmount);
  } else {
    // Pre-fill the USDC amount the order needs. defaultCryptoAmount is from
    // Transak's documented widget model; see ONRAMP.md for its verification
    // status. Harmless if ignored: settlement never trusts the widget amount.
    params.set('defaultCryptoAmount', input.tokenAmount);
  }

  return {
    providerSessionId,
    redirectUrl: `${getWidgetBaseUrl()}/?${params.toString()}`,
    quote: {
      fiatCurrency,
      // Transak quotes fees and the final fiat total inside the widget; we
      // only know the fiat amount up front when the caller pinned a hint.
      fiatAmount,
      tokenAmount: input.tokenAmount,
    },
  };
}

interface TransakOrderSummary {
  status: string;
}

async function fetchOrdersByPartnerOrderId(
  partnerOrderId: string,
): Promise<TransakOrderSummary[]> {
  const search = new URLSearchParams({
    'filter[partnerOrderId]': partnerOrderId,
    'filter[sortOrder]': 'desc',
    limit: '10',
  });
  const url = `${getApiBaseUrl()}/partners/api/v2/orders?${search.toString()}`;

  const doFetch = async (token: string): Promise<Response> => {
    try {
      return await fetch(url, {
        method: 'GET',
        headers: {
          'x-api-key': serverEnv.transakApiKey,
          'access-token': token,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new OnrampProviderError(
        'provider_error',
        `Transak order status request failed: ${message}`,
      );
    }
  };

  let response = await doFetch(await getAccessToken());
  if (response.status === 401) {
    // The cached access token may have been rotated or revoked; mint a fresh
    // one and retry exactly once.
    response = await doFetch(await getAccessToken(true));
  }
  if (!response.ok) {
    throw new OnrampProviderError(
      'provider_error',
      `Transak order status request failed with HTTP ${response.status}`,
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new OnrampProviderError(
      'provider_error',
      'Transak order status response is not valid JSON',
    );
  }
  const data =
    typeof body === 'object' && body !== null ? (body as { data?: unknown }).data : undefined;
  if (!Array.isArray(data)) {
    throw new OnrampProviderError(
      'provider_error',
      'Transak order status response is missing the data array',
    );
  }
  return data
    .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
    .map((entry) => ({ status: typeof entry.status === 'string' ? entry.status : '' }));
}

async function getSessionStatus(providerSessionId: string): Promise<OnrampSessionStatus> {
  const orders = await fetchOrdersByPartnerOrderId(providerSessionId);
  if (orders.length === 0) {
    // No Transak order exists yet for this partnerOrderId: the buyer has not
    // completed the widget flow (or the list filter hides non-terminal
    // orders, see ONRAMP.md). Hold the session at created; webhooks are the
    // primary status channel either way.
    return 'created';
  }
  // A buyer can retry inside the widget, producing several orders for one
  // partnerOrderId. Any completed order funds the session; otherwise the most
  // recent order's status wins.
  if (orders.some((order) => order.status === 'COMPLETED')) {
    return 'completed';
  }
  return mapTransakOrderStatus(orders[0].status);
}

async function parseWebhook(request: Request): Promise<OnrampWebhookEvent | null> {
  const rawBody = await request.text();
  const jwtToken = extractWebhookJwt(rawBody);

  let payload: unknown;
  try {
    payload = verifyTransakWebhookJwt(jwtToken, await getAccessToken());
  } catch (error) {
    if (!(error instanceof TransakSignatureMismatchError)) {
      throw error;
    }
    // Transak signs with the current partner access token, which rotates; our
    // cache may be one generation behind. Refresh once and re-verify before
    // rejecting the delivery.
    payload = verifyTransakWebhookJwt(jwtToken, await getAccessToken(true));
  }

  if (typeof payload !== 'object' || payload === null) {
    throw new OnrampProviderError(
      'provider_error',
      'Transak webhook JWT payload is not an object',
    );
  }
  const event = payload as Record<string, unknown>;
  const eventId = typeof event.eventID === 'string' ? event.eventID : '';
  if (!eventId.startsWith('ORDER_')) {
    // KYC_* and any other non-order events are not on-ramp session updates.
    return null;
  }
  const webhookData = event.webhookData;
  if (typeof webhookData !== 'object' || webhookData === null) {
    throw new OnrampProviderError(
      'provider_error',
      'Transak ORDER_* webhook payload is missing webhookData',
    );
  }
  const order = webhookData as Record<string, unknown>;
  const partnerOrderId =
    typeof order.partnerOrderId === 'string' ? order.partnerOrderId : '';
  if (partnerOrderId.length === 0) {
    // Verified event for an order that was not created through this
    // integration (no correlation id); nothing to update.
    return null;
  }
  const orderStatus = typeof order.status === 'string' ? order.status : '';
  return {
    providerSessionId: partnerOrderId,
    status: orderStatus.length > 0 ? mapTransakOrderStatus(orderStatus) : mapTransakEventId(eventId),
    wallet: typeof order.walletAddress === 'string' ? order.walletAddress : undefined,
    txHash: typeof order.transactionHash === 'string' ? order.transactionHash : undefined,
    raw: toJsonSafe(event),
  };
}

export const transakOnrampProvider: OnrampProvider = {
  name: TRANSAK_PROVIDER_NAME,
  createSession,
  getSessionStatus,
  parseWebhook,
};
