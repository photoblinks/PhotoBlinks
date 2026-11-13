import { createClient } from "@supabase/supabase-js";

/** Anon-key client that keeps its session in memory only — no cookies are
 * read or written, so using it never signs the visitor in or out of the
 * browser session. Used for flows that verify an email OTP / send auth emails
 * on behalf of someone who is not (yet) a logged-in user. */
export function createStatelessClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
