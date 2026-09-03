import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { publicEnv } from '@/lib/env';

export type BrowserClient = SupabaseClient<Database>;

export interface BrowserClientOptions {
  /**
   * Returns the short-lived RLS JWT minted by the server (see
   * src/lib/auth/rlsJwt.ts). When provided it is sent instead of the anon key
   * session, so RLS policies can see the authenticated user's claims.
   */
  accessToken?: () => Promise<string | null>;
}

/**
 * Browser Supabase client, READ ONLY by convention: all writes go through the
 * server repository layer (src/lib/db) and are rejected by RLS if attempted
 * from here with the anon key.
 */
export function createBrowserClient(options: BrowserClientOptions = {}): BrowserClient {
  return createClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    ...(options.accessToken ? { accessToken: options.accessToken } : {}),
  });
}
