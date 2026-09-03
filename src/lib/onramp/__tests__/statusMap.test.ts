/**
 * Plain loops instead of it.each: the repo's global `it` typing comes from
 * the contracts workspace's mocha types, which lack `each`.
 */

import {
  isTerminalOnrampStatus,
  mapThirdwebOnrampStatus,
  nextMockStatus,
} from '@/lib/onramp/statusMap';
import type { OnrampSessionStatus } from '@/lib/onramp/types';

describe('mapThirdwebOnrampStatus', () => {
  it('maps every documented thirdweb status onto the onramp_status enum', () => {
    const cases: Array<[string, OnrampSessionStatus]> = [
      ['CREATED', 'created'],
      ['PENDING', 'pending'],
      ['COMPLETED', 'completed'],
      ['FAILED', 'failed'],
    ];
    for (const [providerStatus, expected] of cases) {
      expect(mapThirdwebOnrampStatus(providerStatus)).toBe(expected);
    }
  });

  it('maps unknown provider statuses to pending instead of terminalizing', () => {
    expect(mapThirdwebOnrampStatus('SOME_FUTURE_STATUS')).toBe('pending');
    expect(mapThirdwebOnrampStatus('')).toBe('pending');
  });

  it('does not accept lowercase database statuses by accident', () => {
    expect(mapThirdwebOnrampStatus('completed')).toBe('pending');
  });
});

describe('isTerminalOnrampStatus', () => {
  it('marks exactly completed, failed and canceled as terminal', () => {
    const cases: Array<[OnrampSessionStatus, boolean]> = [
      ['created', false],
      ['pending', false],
      ['completed', true],
      ['failed', true],
      ['canceled', true],
    ];
    for (const [status, expected] of cases) {
      expect(isTerminalOnrampStatus(status)).toBe(expected);
    }
  });
});

describe('nextMockStatus', () => {
  it('advances created to pending', () => {
    expect(nextMockStatus('created', false)).toBe('pending');
    expect(nextMockStatus('created', true)).toBe('pending');
  });

  it('advances pending to completed on the happy path', () => {
    expect(nextMockStatus('pending', false)).toBe('completed');
  });

  it('advances pending to failed when the failure flag is set', () => {
    expect(nextMockStatus('pending', true)).toBe('failed');
  });

  it('holds terminal statuses', () => {
    const terminal: OnrampSessionStatus[] = ['completed', 'failed', 'canceled'];
    for (const status of terminal) {
      expect(nextMockStatus(status, false)).toBe(status);
      expect(nextMockStatus(status, true)).toBe(status);
    }
  });
});
