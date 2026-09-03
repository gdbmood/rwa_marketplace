jest.mock('server-only', () => ({}));

import { createHmac } from 'crypto';
import {
  __resetTransakAccessTokenCacheForTests,
  mapTransakEventId,
  mapTransakOrderStatus,
  TRANSAK_SESSION_ID_PREFIX,
  transakOnrampProvider,
  verifyTransakWebhookJwt,
} from '@/lib/onramp/transak';
import { OnrampProviderError, type OnrampSessionStatus } from '@/lib/onramp/types';

/**
 * Plain loops instead of it.each: the repo's global `it` typing comes from
 * the contracts workspace's mocha types, which lack `each`.
 */

const ACCESS_TOKEN = 'test-partner-access-token';

const BASE_INPUT = {
  userId: 'user-1',
  orderId: 'order-1',
  wallet: '0x1111111111111111111111111111111111111111',
  fiatCurrency: 'USD',
  tokenAmount: '150.25',
  chainId: 8453,
};

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

/** Builds an HS256 JWT signed with `secret` (or with a bogus alg for attacks). */
function makeJwt(payload: unknown, secret: string, alg = 'HS256'): string {
  const header = base64Url(JSON.stringify({ alg, typ: 'JWT' }));
  const body = base64Url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

function makeTextRequest(body: string): Request {
  return { text: async () => body } as unknown as Request;
}

function accessTokenResponse(): unknown {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      data: {
        accessToken: ACCESS_TOKEN,
        expiresAt: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
      },
    }),
  };
}

function ordersResponse(orders: Array<Record<string, unknown>>): unknown {
  return {
    ok: true,
    status: 200,
    json: async () => ({ meta: { totalCount: orders.length }, data: orders }),
  };
}

const fetchMock = jest.fn();

beforeEach(() => {
  process.env.TRANSAK_API_KEY = 'test-api-key';
  process.env.TRANSAK_API_SECRET = 'test-api-secret';
  process.env.TRANSAK_ENVIRONMENT = 'STAGING';
  __resetTransakAccessTokenCacheForTests();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(accessTokenResponse());
  (globalThis as { fetch: unknown }).fetch = fetchMock;
});

afterAll(() => {
  delete process.env.TRANSAK_API_KEY;
  delete process.env.TRANSAK_API_SECRET;
  delete process.env.TRANSAK_ENVIRONMENT;
});

describe('transakOnrampProvider.createSession', () => {
  it('builds a staging widget URL carrying the full parameter set', async () => {
    const session = await transakOnrampProvider.createSession(BASE_INPUT);

    expect(session.providerSessionId.startsWith(TRANSAK_SESSION_ID_PREFIX)).toBe(true);
    expect(session.redirectUrl).toBeDefined();

    const url = new URL(session.redirectUrl as string);
    expect(url.origin).toBe('https://global-stg.transak.com');
    expect(url.searchParams.get('apiKey')).toBe('test-api-key');
    expect(url.searchParams.get('environment')).toBe('STAGING');
    expect(url.searchParams.get('fiatCurrency')).toBe('USD');
    expect(url.searchParams.get('cryptoCurrencyCode')).toBe('USDC');
    expect(url.searchParams.get('network')).toBe('base');
    expect(url.searchParams.get('walletAddress')).toBe(BASE_INPUT.wallet);
    expect(url.searchParams.get('disableWalletAddressForm')).toBe('true');
    expect(url.searchParams.get('partnerOrderId')).toBe(session.providerSessionId);
    expect(url.searchParams.get('partnerCustomerId')).toBe('user-1');
    expect(url.searchParams.get('defaultCryptoAmount')).toBe('150.25');
    // No fiat hint given, so no fiat prefill.
    expect(url.searchParams.get('defaultFiatAmount')).toBeNull();
  });

  it('makes no network call: the widget URL is built locally', async () => {
    await transakOnrampProvider.createSession(BASE_INPUT);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the production host when TRANSAK_ENVIRONMENT=PRODUCTION', async () => {
    process.env.TRANSAK_ENVIRONMENT = 'PRODUCTION';
    const session = await transakOnrampProvider.createSession(BASE_INPUT);
    const url = new URL(session.redirectUrl as string);
    expect(url.origin).toBe('https://global.transak.com');
    expect(url.searchParams.get('environment')).toBe('PRODUCTION');
  });

  it('generates a fresh partnerOrderId per session', async () => {
    const first = await transakOnrampProvider.createSession(BASE_INPUT);
    const second = await transakOnrampProvider.createSession(BASE_INPUT);
    expect(first.providerSessionId).not.toBe(second.providerSessionId);
  });

  it('supports EUR and normalizes its casing', async () => {
    const session = await transakOnrampProvider.createSession({
      ...BASE_INPUT,
      fiatCurrency: 'eur',
    });
    const url = new URL(session.redirectUrl as string);
    expect(url.searchParams.get('fiatCurrency')).toBe('EUR');
    expect(session.quote.fiatCurrency).toBe('EUR');
  });

  it('falls back to USD for unsupported fiat currencies and says so in the quote', async () => {
    const session = await transakOnrampProvider.createSession({
      ...BASE_INPUT,
      fiatCurrency: 'AED',
    });
    const url = new URL(session.redirectUrl as string);
    expect(url.searchParams.get('fiatCurrency')).toBe('USD');
    expect(session.quote.fiatCurrency).toBe('USD');
  });

  it('prefills defaultFiatAmount instead of the crypto amount when a fiat hint is given', async () => {
    const session = await transakOnrampProvider.createSession({
      ...BASE_INPUT,
      fiatAmount: '160',
    });
    const url = new URL(session.redirectUrl as string);
    expect(url.searchParams.get('defaultFiatAmount')).toBe('160');
    expect(url.searchParams.get('defaultCryptoAmount')).toBeNull();
    expect(session.quote.fiatAmount).toBe('160');
  });

  it('quotes a null fiat amount when no hint is given (Transak quotes in-widget)', async () => {
    const session = await transakOnrampProvider.createSession(BASE_INPUT);
    expect(session.quote).toEqual({
      fiatCurrency: 'USD',
      fiatAmount: null,
      tokenAmount: '150.25',
    });
  });

  it('maps Base Sepolia to the same transak network code as Base mainnet', async () => {
    const session = await transakOnrampProvider.createSession({
      ...BASE_INPUT,
      chainId: 84532,
    });
    const url = new URL(session.redirectUrl as string);
    expect(url.searchParams.get('network')).toBe('base');
  });

  it('rejects chains without a Transak network mapping', async () => {
    await expect(
      transakOnrampProvider.createSession({ ...BASE_INPUT, chainId: 137 }),
    ).rejects.toMatchObject({ name: 'OnrampProviderError', code: 'provider_error' });
  });

  it('rejects invalid wallet addresses', async () => {
    await expect(
      transakOnrampProvider.createSession({ ...BASE_INPUT, wallet: 'not-an-address' }),
    ).rejects.toMatchObject({ name: 'OnrampProviderError', code: 'invalid_input' });
  });

  it('rejects malformed token amounts', async () => {
    await expect(
      transakOnrampProvider.createSession({ ...BASE_INPUT, tokenAmount: '1,50' }),
    ).rejects.toMatchObject({ name: 'OnrampProviderError', code: 'invalid_input' });
  });
});

describe('mapTransakOrderStatus', () => {
  it('maps every documented Transak order status conservatively', () => {
    const cases: Array<[string, OnrampSessionStatus]> = [
      ['AWAITING_PAYMENT_FROM_USER', 'pending'],
      ['PAYMENT_DONE_MARKED_BY_USER', 'pending'],
      ['PROCESSING', 'pending'],
      ['PENDING_DELIVERY_FROM_TRANSAK', 'pending'],
      ['ON_HOLD_PENDING_DELIVERY_FROM_TRANSAK', 'pending'],
      ['COMPLETED', 'completed'],
      ['FAILED', 'failed'],
      ['CANCELLED', 'canceled'],
      // Deliberately non-terminal (see the map's comment in transak.ts).
      ['EXPIRED', 'pending'],
      ['REFUNDED', 'pending'],
    ];
    for (const [providerStatus, expected] of cases) {
      expect(mapTransakOrderStatus(providerStatus)).toBe(expected);
    }
  });

  it('maps unknown provider statuses to pending instead of terminalizing', () => {
    expect(mapTransakOrderStatus('SOME_FUTURE_STATUS')).toBe('pending');
    expect(mapTransakOrderStatus('')).toBe('pending');
  });

  it('does not accept lowercase database statuses by accident', () => {
    expect(mapTransakOrderStatus('completed')).toBe('pending');
  });
});

describe('mapTransakEventId', () => {
  it('maps webhook event ids with the same terminality rules', () => {
    const cases: Array<[string, OnrampSessionStatus]> = [
      ['ORDER_CREATED', 'pending'],
      ['ORDER_PAYMENT_VERIFYING', 'pending'],
      ['ORDER_PROCESSING', 'pending'],
      ['ORDER_COMPLETED', 'completed'],
      ['ORDER_FAILED', 'failed'],
      ['ORDER_CANCELLED', 'canceled'],
      ['ORDER_SOMETHING_NEW', 'pending'],
    ];
    for (const [eventId, expected] of cases) {
      expect(mapTransakEventId(eventId)).toBe(expected);
    }
  });
});

describe('transakOnrampProvider.getSessionStatus', () => {
  it('returns created when no Transak order exists yet for the partnerOrderId', async () => {
    fetchMock
      .mockResolvedValueOnce(accessTokenResponse())
      .mockResolvedValueOnce(ordersResponse([]));
    await expect(
      transakOnrampProvider.getSessionStatus('transak_none'),
    ).resolves.toBe('created');

    // Refresh token call, then the orders poll against the staging API.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const ordersUrl = String(fetchMock.mock.calls[1][0]);
    expect(ordersUrl.startsWith('https://api-stg.transak.com/partners/api/v2/orders?')).toBe(true);
    expect(ordersUrl).toContain('partnerOrderId');
    expect(ordersUrl).toContain('transak_none');
  });

  it('maps a live order status onto the enum', async () => {
    fetchMock
      .mockResolvedValueOnce(accessTokenResponse())
      .mockResolvedValueOnce(ordersResponse([{ status: 'PROCESSING' }]));
    await expect(
      transakOnrampProvider.getSessionStatus('transak_abc'),
    ).resolves.toBe('pending');
  });

  it('treats any COMPLETED order among retries as completion', async () => {
    fetchMock
      .mockResolvedValueOnce(accessTokenResponse())
      .mockResolvedValueOnce(
        ordersResponse([{ status: 'FAILED' }, { status: 'COMPLETED' }]),
      );
    await expect(
      transakOnrampProvider.getSessionStatus('transak_abc'),
    ).resolves.toBe('completed');
  });

  it('throws provider_error on an API failure', async () => {
    fetchMock
      .mockResolvedValueOnce(accessTokenResponse())
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    await expect(
      transakOnrampProvider.getSessionStatus('transak_abc'),
    ).rejects.toMatchObject({ name: 'OnrampProviderError', code: 'provider_error' });
  });
});

describe('transakOnrampProvider.parseWebhook', () => {
  const orderPayload = {
    eventID: 'ORDER_COMPLETED',
    createdAt: '2026-09-03T00:00:00.000Z',
    webhookData: {
      id: 'transak-order-id-1',
      partnerOrderId: 'transak_abc',
      status: 'COMPLETED',
      walletAddress: '0x2222222222222222222222222222222222222222',
      transactionHash: '0xdeadbeef',
      fiatCurrency: 'USD',
      cryptoCurrency: 'USDC',
    },
  };

  it('verifies and maps a genuine ORDER_COMPLETED payload', async () => {
    const jwt = makeJwt(orderPayload, ACCESS_TOKEN);
    const event = await transakOnrampProvider.parseWebhook(
      makeTextRequest(JSON.stringify({ data: jwt })),
    );
    expect(event).toEqual({
      providerSessionId: 'transak_abc',
      status: 'completed',
      wallet: '0x2222222222222222222222222222222222222222',
      txHash: '0xdeadbeef',
      raw: orderPayload,
    });
  });

  it('rejects a forged payload signed with the wrong secret', async () => {
    const jwt = makeJwt(orderPayload, 'attacker-secret');
    await expect(
      transakOnrampProvider.parseWebhook(makeTextRequest(JSON.stringify({ data: jwt }))),
    ).rejects.toMatchObject({ name: 'OnrampProviderError', code: 'provider_error' });
    // The provider refreshed the access token once before rejecting, in case
    // Transak had rotated it: initial token fetch plus one forced refresh.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects a tampered payload even when the signature is from a real token', async () => {
    const genuine = makeJwt(orderPayload, ACCESS_TOKEN);
    const [, , signature] = genuine.split('.');
    const tamperedBody = Buffer.from(
      JSON.stringify({
        ...orderPayload,
        webhookData: { ...orderPayload.webhookData, walletAddress: '0xattacker' },
      }),
    ).toString('base64url');
    const [header] = genuine.split('.');
    const tampered = `${header}.${tamperedBody}.${signature}`;
    await expect(
      transakOnrampProvider.parseWebhook(makeTextRequest(JSON.stringify({ data: tampered }))),
    ).rejects.toMatchObject({ name: 'OnrampProviderError', code: 'provider_error' });
  });

  it('rejects tokens that are not HS256 signed (alg confusion)', async () => {
    const jwt = makeJwt(orderPayload, ACCESS_TOKEN, 'none');
    await expect(
      transakOnrampProvider.parseWebhook(makeTextRequest(JSON.stringify({ data: jwt }))),
    ).rejects.toMatchObject({ name: 'OnrampProviderError', code: 'provider_error' });
  });

  it('rejects bodies without a signed data payload', async () => {
    await expect(
      transakOnrampProvider.parseWebhook(makeTextRequest(JSON.stringify({ hello: 'world' }))),
    ).rejects.toBeInstanceOf(OnrampProviderError);
    await expect(
      transakOnrampProvider.parseWebhook(makeTextRequest('not json either')),
    ).rejects.toMatchObject({ name: 'OnrampProviderError', code: 'provider_error' });
  });

  it('returns null for verified non-order events such as KYC updates', async () => {
    const jwt = makeJwt(
      { eventID: 'KYC_APPROVED', kycStatus: 'APPROVED', partnerUserId: 'user-1' },
      ACCESS_TOKEN,
    );
    await expect(
      transakOnrampProvider.parseWebhook(makeTextRequest(JSON.stringify({ data: jwt }))),
    ).resolves.toBeNull();
  });

  it('returns null for verified order events without a partnerOrderId', async () => {
    const jwt = makeJwt(
      {
        eventID: 'ORDER_COMPLETED',
        webhookData: { id: 'foreign-order', status: 'COMPLETED' },
      },
      ACCESS_TOKEN,
    );
    await expect(
      transakOnrampProvider.parseWebhook(makeTextRequest(JSON.stringify({ data: jwt }))),
    ).resolves.toBeNull();
  });

  it('falls back to the eventID when webhookData has no status', async () => {
    const jwt = makeJwt(
      {
        eventID: 'ORDER_FAILED',
        webhookData: { id: 'x', partnerOrderId: 'transak_abc' },
      },
      ACCESS_TOKEN,
    );
    const event = await transakOnrampProvider.parseWebhook(
      makeTextRequest(JSON.stringify({ data: jwt })),
    );
    expect(event?.status).toBe('failed');
  });

  it('accepts a bare JWT body defensively', async () => {
    const jwt = makeJwt(orderPayload, ACCESS_TOKEN);
    const event = await transakOnrampProvider.parseWebhook(makeTextRequest(jwt));
    expect(event?.providerSessionId).toBe('transak_abc');
    expect(event?.status).toBe('completed');
  });
});

describe('verifyTransakWebhookJwt', () => {
  it('round-trips a payload signed with the right secret', () => {
    const payload = { eventID: 'ORDER_CREATED', webhookData: { partnerOrderId: 'p1' } };
    expect(verifyTransakWebhookJwt(makeJwt(payload, 'secret-1'), 'secret-1')).toEqual(payload);
  });

  it('throws on a wrong secret', () => {
    const payload = { eventID: 'ORDER_CREATED' };
    expect(() =>
      verifyTransakWebhookJwt(makeJwt(payload, 'secret-1'), 'secret-2'),
    ).toThrow(OnrampProviderError);
  });

  it('throws on structurally invalid tokens', () => {
    expect(() => verifyTransakWebhookJwt('nope', 'secret')).toThrow(OnrampProviderError);
    expect(() => verifyTransakWebhookJwt('a.b', 'secret')).toThrow(OnrampProviderError);
  });
});
