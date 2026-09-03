import 'server-only';

import { Bridge, createThirdwebClient, type ThirdwebClient } from 'thirdweb';
import type { Json } from '@/types/database';
import { publicEnv, serverEnv } from '@/lib/env';
import { mapThirdwebOnrampStatus } from '@/lib/onramp/statusMap';
import { microToUsdc, usdcToMicro } from '@/lib/onramp/usdc';
import {
  type CreateOnrampSessionInput,
  type CreateOnrampSessionResult,
  type OnrampProvider,
  OnrampProviderError,
  type OnrampSessionStatus,
  type OnrampWebhookEvent,
} from '@/lib/onramp/types';

/**
 * OnrampProvider over thirdweb v5 Bridge.Onramp (prepare + status) and the
 * Universal Bridge webhook. Server side only: uses THIRDWEB_SECRET_KEY via a
 * dedicated lazy client so importing this module never touches env vars.
 *
 * thirdweb routes the actual fiat leg through one of its integrated
 * sub-providers (coinbase, stripe or transak), selected by
 * THIRDWEB_ONRAMP_PROVIDER (default coinbase). Coverage caveats, including
 * the UAE gap, are documented in docs/architecture/ONRAMP.md.
 */

type ThirdwebSubProvider = 'coinbase' | 'stripe' | 'transak';

const SUB_PROVIDERS: readonly ThirdwebSubProvider[] = ['coinbase', 'stripe', 'transak'];
const DEFAULT_SUB_PROVIDER: ThirdwebSubProvider = 'coinbase';

let serverClient: ThirdwebClient | null = null;

function getServerClient(): ThirdwebClient {
  if (!serverClient) {
    serverClient = createThirdwebClient({ secretKey: serverEnv.thirdwebSecretKey });
  }
  return serverClient;
}

function getSubProvider(): ThirdwebSubProvider {
  const raw = process.env.THIRDWEB_ONRAMP_PROVIDER;
  if (!raw) {
    return DEFAULT_SUB_PROVIDER;
  }
  const normalized = raw.trim().toLowerCase();
  if (!(SUB_PROVIDERS as readonly string[]).includes(normalized)) {
    throw new OnrampProviderError(
      'provider_error',
      `THIRDWEB_ONRAMP_PROVIDER must be one of ${SUB_PROVIDERS.join(', ')}, got "${raw}"`,
    );
  }
  return normalized as ThirdwebSubProvider;
}

/**
 * Secret configured on the thirdweb webhook, used to verify x-payload
 * signatures.
 */
function getWebhookSecret(): string {
  return serverEnv.thirdwebWebhookSecret;
}

function asAddress(value: string, label: string): `0x${string}` {
  const trimmed = value.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    throw new OnrampProviderError('invalid_input', `${label} is not a valid EVM address`);
  }
  return trimmed as `0x${string}`;
}

/** Serializes provider payloads (which may contain bigints) into Json. */
function toJsonSafe(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_key, val) => (typeof val === 'bigint' ? val.toString() : val)),
  ) as Json;
}

async function createSession(
  input: CreateOnrampSessionInput,
): Promise<CreateOnrampSessionResult> {
  const receiver = asAddress(input.wallet, 'wallet');
  const tokenAddress = asAddress(publicEnv.usdcContractAddress, 'USDC contract address');
  const amount = usdcToMicro(input.tokenAmount);

  let prepared: Awaited<ReturnType<typeof Bridge.Onramp.prepare>>;
  try {
    prepared = await Bridge.Onramp.prepare({
      client: getServerClient(),
      onramp: getSubProvider(),
      chainId: input.chainId,
      tokenAddress,
      receiver,
      amount,
      currency: input.fiatCurrency,
      purchaseData: { orderId: input.orderId, userId: input.userId },
    });
  } catch (error) {
    if (error instanceof OnrampProviderError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new OnrampProviderError(
      'provider_error',
      `thirdweb onramp prepare failed: ${message}`,
    );
  }

  return {
    providerSessionId: prepared.id,
    redirectUrl: prepared.link,
    quote: {
      fiatCurrency: prepared.currency,
      fiatAmount:
        typeof prepared.currencyAmount === 'number' && Number.isFinite(prepared.currencyAmount)
          ? prepared.currencyAmount.toFixed(2)
          : (input.fiatAmount ?? null),
      tokenAmount: microToUsdc(prepared.destinationAmount),
    },
  };
}

async function getSessionStatus(providerSessionId: string): Promise<OnrampSessionStatus> {
  try {
    const result = await Bridge.Onramp.status({
      id: providerSessionId,
      client: getServerClient(),
    });
    return mapThirdwebOnrampStatus(result.status);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new OnrampProviderError(
      'provider_error',
      `thirdweb onramp status failed: ${message}`,
    );
  }
}

async function parseWebhook(request: Request): Promise<OnrampWebhookEvent | null> {
  const payload = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let parsed: Bridge.WebhookPayload;
  try {
    parsed = await Bridge.Webhook.parse(payload, headers, getWebhookSecret());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new OnrampProviderError(
      'provider_error',
      `thirdweb webhook verification failed: ${message}`,
    );
  }

  // Only onramp session updates matter here; onchain-transaction events are
  // the indexer's concern.
  if (parsed.type !== 'pay.onramp-transaction') {
    return null;
  }

  const data = parsed.data;
  return {
    providerSessionId: data.id,
    status: mapThirdwebOnrampStatus(data.status),
    wallet: data.receiver,
    txHash: data.transactionHash,
    raw: toJsonSafe(parsed),
  };
}

export const thirdwebOnrampProvider: OnrampProvider = {
  name: 'thirdweb',
  createSession,
  getSessionStatus,
  parseWebhook,
};
