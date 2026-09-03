/**
 * Pure status helpers shared by the providers and the API routes. Kept free
 * of server-only imports so unit tests can exercise them directly.
 */

import type { OnrampSessionStatus } from '@/lib/onramp/types';

const TERMINAL_STATUSES: readonly OnrampSessionStatus[] = ['completed', 'failed', 'canceled'];

export function isTerminalOnrampStatus(status: OnrampSessionStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** Statuses Bridge.Onramp.status and the thirdweb webhook can report. */
const THIRDWEB_STATUS_MAP: Record<string, OnrampSessionStatus> = {
  CREATED: 'created',
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

/**
 * Maps a thirdweb onramp status onto the onramp_status enum. Unknown values
 * map to pending so a new provider status can never terminalize a session
 * incorrectly; the next poll or webhook resolves it.
 */
export function mapThirdwebOnrampStatus(status: string): OnrampSessionStatus {
  return THIRDWEB_STATUS_MAP[status] ?? 'pending';
}

/**
 * Deterministic state machine for the mock provider. Each poll advances one
 * step: created to pending, pending to completed (or failed when the session
 * was created with the magic failing fiat amount). Terminal states hold.
 */
export function nextMockStatus(
  current: OnrampSessionStatus,
  forceFail: boolean,
): OnrampSessionStatus {
  if (isTerminalOnrampStatus(current)) {
    return current;
  }
  if (current === 'created') {
    return 'pending';
  }
  return forceFail ? 'failed' : 'completed';
}
