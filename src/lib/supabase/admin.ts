import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client. Bypasses RLS entirely — never import this into a
// Client Component or anything that reaches the browser bundle. Reserved for
// trusted server-only tasks (e.g. seeding the first admin user), since the
// `admins` table has no insert policy for regular authenticated users.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
