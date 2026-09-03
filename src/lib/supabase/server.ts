import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { publicEnv, serverEnv } from '@/lib/env';

export type ServiceClient = SupabaseClient<Database>;

let serviceClient: ServiceClient | null = null;

/**
 * Service-role Supabase client. Bypasses RLS, so it must only be used by the
 * repository layer in src/lib/db, which enforces ownership in code.
 * Singleton per server process.
 */
export function createServiceClient(): ServiceClient {
  if (!serviceClient) {
    serviceClient = createClient<Database>(
      publicEnv.supabaseUrl,
      serverEnv.supabaseServiceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
  }
  return serviceClient;
}
