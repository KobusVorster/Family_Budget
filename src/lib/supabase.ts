import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/* The two values that point the app at your database.
 *
 * Both are safe to ship in the built site. The "anon" key is designed to be
 * public — what actually protects the data is the row-level security in
 * `supabase/schema.sql`, which the database enforces on every query. The
 * service-role key is the dangerous one, and it must never appear here. */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True once the two keys are set. Until then the app runs happily on this
 *  browser's own storage, so local development and the preview build keep
 *  working without any account. */
export function isCloudConfigured(): boolean {
  return Boolean(url && anonKey && url.startsWith('http'));
}

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    if (!isCloudConfigured()) {
      throw new Error('Supabase is not set up. See DEPLOY.md.');
    }
    client = createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}
