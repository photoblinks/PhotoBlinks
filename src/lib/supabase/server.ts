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
      global: {
        // Next.js patches the global fetch() to memoize identical requests
        // within a single render pass. Without this, two sequential reads
        // of the same row in one request — e.g. read, write, re-read to
        // confirm the write landed — can silently return the first
        // (pre-write) cached response instead of querying Postgres again.
        // Every request this client makes is either a mutation or needs
        // the current committed state, never something safe to memoize.
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
    },
  );
}
