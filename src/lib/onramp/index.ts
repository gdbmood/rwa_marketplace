import 'server-only';

import type { OnrampProvider } from '@/lib/onramp/types';
import { mockOnrampProvider } from '@/lib/onramp/mock';
import { thirdwebOnrampProvider } from '@/lib/onramp/thirdweb';

export type {
  CreateOnrampSessionInput,
  CreateOnrampSessionResult,
  OnrampProvider,
  OnrampQuote,
  OnrampSessionStatus,
  OnrampWebhookEvent,
} from '@/lib/onramp/types';
export { OnrampProviderError } from '@/lib/onramp/types';

/**
 * Active provider selection. TEST_MODE=1 wires the deterministic mock so CI
 * and e2e runs need no external credentials; production behaviour is
 * unchanged when the flag is absent (see IMPLEMENTATION_PLAN.md, Test mode).
 */
export function getOnrampProvider(): OnrampProvider {
  if (process.env.TEST_MODE === '1') {
    return mockOnrampProvider;
  }
  return thirdwebOnrampProvider;
}
