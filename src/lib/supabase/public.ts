import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Cookie-free Supabase client for PUBLIC (published/active) data reads —
 * published locations/studios, active categories/states/cities, SEO
 * landing-page data, editorial/blog content, and the anonymous analytics
 * insert in src/lib/sponsored-photographer-analytics.ts. Unlike
 * `./server.ts` (which reads `cookies()` to hydrate a signed-in session),
 * this client never touches `cookies()` or `headers()`, so pages that only
 * use it are eligible for Next's Full Route Cache / ISR instead of being
 * forced fully dynamic.
 *
 * Phase 1 (direct bulk-exposure closure): this now authenticates as the
 * service role, NOT the anon role. Public pages render server-side, and
 * after supabase/migrations/20261007000000_close_anon_bulk_exposure.sql the
 * anon role no longer has table SELECT, so public reads must run through a
 * privileged server-side role. The `server-only` import hard-fails any
 * accidental client-bundle import so the service-role key can never ship to
 * the browser. RLS is bypassed here, so every query in this module MUST keep
 * its explicit `is_published = true` / `is_active = true` / `status =
 * 'published'` filters — those filters, not RLS, are now the correctness
 * boundary for public data.
 *
 * Never use this for admin/authenticated queries or writes (those go
 * through `./server.ts` and `./admin.ts`).
 */
export function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
