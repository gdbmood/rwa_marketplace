/**
 * Pure input validators shared by the server actions. No server imports so
 * they stay unit-testable.
 */

const TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const WALLET_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function isTxHash(value: unknown): value is string {
  return typeof value === 'string' && TX_HASH_PATTERN.test(value);
}

export function isWalletAddress(value: unknown): value is string {
  return typeof value === 'string' && WALLET_PATTERN.test(value);
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/** Non-empty trimmed string with a length cap. Returns the trimmed value or null. */
export function cleanString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) {
    return null;
  }
  return trimmed;
}
