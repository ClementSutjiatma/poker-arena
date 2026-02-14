import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

// Lazy initialization: only connect when Supabase env vars are set.
// This allows the app to run without a DB (in-memory only) during development.
let _client: SupabaseClient | null = null;
let _warned = false;

export function getDb(): SupabaseClient | null {
  if (_client) return _client;
  if (!supabaseUrl || !supabaseKey) {
    if (!_warned) {
      _warned = true;
      console.warn('[db] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY not set — persistence disabled');
    }
    return null;
  }

  _client = createClient(supabaseUrl, supabaseKey);
  console.log('[db] Supabase client initialized — persistence enabled');
  return _client;
}

export type Database = NonNullable<ReturnType<typeof getDb>>;
