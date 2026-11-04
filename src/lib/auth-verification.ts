import type { SupabaseClient } from "@supabase/supabase-js";
import { absoluteUrl } from "@/lib/jsonld";

/** Emails the verification link (a one-time email OTP; /auth/confirm marks
 * the account verified when it is used). Failure is logged, never thrown: the
 * user is already signed in and can resend from the verify banner. Kept out of
 * the "use server" action files so it is not exposed as a client-callable
 * action. */
export async function sendVerificationEmail(supabase: SupabaseClient, email: string, next: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: absoluteUrl(next) },
  });
  if (error) console.error("sendVerificationEmail failed", { code: error.code, status: error.status });
  return !error;
}
