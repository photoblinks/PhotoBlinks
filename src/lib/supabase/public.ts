import { createClient } from "@supabase/supabase-js";

/**
 * Cookie-free Supabase client for PUBLIC, anonymous reads only — published
 * locations/studios, active categories/states/cities, SEO landing-page
 * data. Unlike `./server.ts` (which reads `cookies()` to hydrate a
 * signed-in session for admin/RLS), this client never touches `cookies()`
 * or `headers()`, so pages that only use it are eligible for Next's Full
 * Route Cache / ISR instead of being forced fully dynamic.
 *
 * It always authenticates as the `anon` role via the public anon key and
 * remains fully subject to RLS — the same `is_published = true` /
 * `is_active = true` policies that already gate these reads, identical to
 * what an unauthenticated visitor already got from the cookie-based client.
 * Never use this for admin/authenticated queries or writes, and never wire
 * the service-role key through it.
 */
export function createPublicClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
}
