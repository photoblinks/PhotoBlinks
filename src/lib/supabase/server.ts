import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server client for Server Components / Server Actions / Route Handlers.
// Reads the signed-in user's session from cookies, so RLS applies per-user
// (anon for public pages, the admin's own row for /admin).
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll is called from a Server Component during render, where
            // cookies can't be written. Safe to ignore when middleware is
            // refreshing the session on every request.
          }
        },
      },
    },
  );
}
