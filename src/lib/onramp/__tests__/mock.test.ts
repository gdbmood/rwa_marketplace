jest.mock('server-only', () => ({}));
jest.mock('@/lib/db/onramp', () => ({
  getOnrampSessionByProviderId: jest.fn(),
}));

import { getOnrampSessionByProviderId, type OnrampSessionRow } from '@/lib/db/onramp';
import {
  MOCK_FAIL_FIAT_AMOUNT,
  MOCK_SESSION_ID_PREFIX,
  mockOnrampProvider,
} from '@/lib/onramp/mock';
import { OnrampProviderError } from '@/lib/onramp/types';

const mockedGetSession = getOnrampSessionByProviderId as jest.MockedFunction<
  typeof getOnrampSessionByProviderId
>;

function makeSessionRow(overrides: Partial<OnrampSessionRow> = {}): OnrampSessionRow {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    order_id: '00000000-0000-0000-0000-000000000002',
    user_id: '00000000-0000-0000-0000-000000000003',
    provider: 'mock',
    provider_session_id: 'mock_abc',
    fiat_currency: 'USD',
    fiat_amount: 100 as OnrampSessionRow['fiat_amount'],
    token_amount: 100 as OnrampSessionRow['token_amount'],
    status: 'created',
    raw_payload: null,
    created_at: '2026-09-03T00:00:00.000Z',
    updated_at: null,
    ...overrides,
  };
}

function makeJsonRequest(body: unknown): Request {
  return { json: async () => body } as unknown as Request;
}

function makeBrokenRequest(): Request {
  return {
    json: async () => {
      throw new SyntaxError('Unexpected token');
    },
  } as unknown as Request;
}

beforeEach(() => {
  mockedGetSession.mockReset();
});

describe('mockOnrampProvider.createSession', () => {
  const input = {
    userId: 'user-1',
    orderId: 'order-1',
    wallet: '0x1111111111111111111111111111111111111111',
    fiatCurrency: 'USD',
    tokenAmount: '150.25',
    chainId: 31337,
  };

  it('returns a prefixed session id and a local redirect URL', async () => {
    const session = await mockOnrampProvider.createSession(input);
    expect(session.providerSessionId.startsWith(MOCK_SESSION_ID_PREFIX)).toBe(true);
    expect(session.redirectUrl).toBe(`/onramp/mock?session=${session.providerSessionId}`);
  });

  it('generates a fresh session id per call', async () => {
    const first = await mockOnrampProvider.createSession(input);
    const second = await mockOnrampProvider.createSession(input);
    expect(first.providerSessionId).not.toBe(second.providerSessionId);
  });

  it('quotes fiat 1:1 with the token amount by default', async () => {
    const session = await mockOnrampProvider.createSession(input);
    expect(session.quote).toEqual({
      fiatCurrency: 'USD',
      fiatAmount: '150.25',
      tokenAmount: '150.25',
    });
  });

  it('keeps a caller-pinned fiat amount, enabling the magic failure value', async () => {
    const session = await mockOnrampProvider.createSession({
      ...input,
      fiatAmount: String(MOCK_FAIL_FIAT_AMOUNT),
    });
    expect(session.quote.fiatAmount).toBe('13');
  });
});

describe('mockOnrampProvider.getSessionStatus', () => {
  it('advances created to pending', async () => {
    mockedGetSession.mockResolvedValue(makeSessionRow({ status: 'created' }));
    await expect(mockOnrampProvider.getSessionStatus('mock_abc')).resolves.toBe('pending');
  });

  it('advances pending to completed', async () => {
    mockedGetSession.mockResolvedValue(makeSessionRow({ status: 'pending' }));
    await expect(mockOnrampProvider.getSessionStatus('mock_abc')).resolves.toBe('completed');
  });

  it('fails from pending when the fiat amount is the magic value', async () => {
    mockedGetSession.mockResolvedValue(
      makeSessionRow({
        status: 'pending',
        fiat_amount: MOCK_FAIL_FIAT_AMOUNT as OnrampSessionRow['fiat_amount'],
      }),
    );
    await expect(mockOnrampProvider.getSessionStatus('mock_abc')).resolves.toBe('failed');
  });

  it('parses the magic value when the row comes back as a numeric string', async () => {
    mockedGetSession.mockResolvedValue(
      makeSessionRow({
        status: 'pending',
        // Postgres numeric columns cross the wire as strings.
        fiat_amount: '13' as unknown as OnrampSessionRow['fiat_amount'],
      }),
    );
    await expect(mockOnrampProvider.getSessionStatus('mock_abc')).resolves.toBe('failed');
  });

  it('holds terminal statuses', async () => {
    mockedGetSession.mockResolvedValue(makeSessionRow({ status: 'completed' }));
    await expect(mockOnrampProvider.getSessionStatus('mock_abc')).resolves.toBe('completed');
  });

  it('throws not_found for an unknown session', async () => {
    mockedGetSession.mockResolvedValue(null);
    await expect(mockOnrampProvider.getSessionStatus('mock_missing')).rejects.toMatchObject({
      name: 'OnrampProviderError',
      code: 'not_found',
    });
    await expect(mockOnrampProvider.getSessionStatus('mock_missing')).rejects.toBeInstanceOf(
      OnrampProviderError,
    );
  });
});

describe('mockOnrampProvider.parseWebhook', () => {
  it('parses a valid transition payload', async () => {
    const event = await mockOnrampProvider.parseWebhook(
      makeJsonRequest({ providerSessionId: 'mock_abc', status: 'completed' }),
    );
    expect(event).toEqual({
      providerSessionId: 'mock_abc',
      status: 'completed',
      wallet: undefined,
      txHash: undefined,
      raw: { providerSessionId: 'mock_abc', status: 'completed' },
    });
  });

  it('passes through optional wallet and txHash fields', async () => {
    const event = await mockOnrampProvider.parseWebhook(
      makeJsonRequest({
        providerSessionId: 'mock_abc',
        status: 'completed',
        wallet: '0x2222222222222222222222222222222222222222',
        txHash: '0xdeadbeef',
      }),
    );
    expect(event?.wallet).toBe('0x2222222222222222222222222222222222222222');
    expect(event?.txHash).toBe('0xdeadbeef');
  });

  it('returns null for a payload missing the session id', async () => {
    await expect(
      mockOnrampProvider.parseWebhook(makeJsonRequest({ status: 'completed' })),
    ).resolves.toBeNull();
  });

  it('returns null for an unknown status value', async () => {
    await expect(
      mockOnrampProvider.parseWebhook(
        makeJsonRequest({ providerSessionId: 'mock_abc', status: 'COMPLETED' }),
      ),
    ).resolves.toBeNull();
  });

  it('returns null for non-object and unparsable bodies', async () => {
    await expect(mockOnrampProvider.parseWebhook(makeJsonRequest('nope'))).resolves.toBeNull();
    await expect(mockOnrampProvider.parseWebhook(makeBrokenRequest())).resolves.toBeNull();
  });
});
