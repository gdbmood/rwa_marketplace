import 'server-only';

import { serverEnv } from '@/lib/env';
import type { OnrampProvider } from '@/lib/onramp/types';
import { mockOnrampProvider } from '@/lib/onramp/mock';
import { thirdwebOnrampProvider } from '@/lib/onramp/thirdweb';
import { transakOnrampProvider } from '@/lib/onramp/transak';

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
 * and e2e runs need no external credentials. Otherwise ONRAMP_PROVIDER picks
 * thirdweb or transak; the default is transak because thirdweb's hosted
 * on-ramp excludes UAE users (decision recorded in
 * docs/architecture/ONRAMP.md).
 */
export function getOnrampProvider(): OnrampProvider {
  if (process.env.TEST_MODE === '1') {
    return mockOnrampProvider;
  }
  return serverEnv.onrampProvider === 'thirdweb'
    ? thirdwebOnrampProvider
    : transakOnrampProvider;
}
