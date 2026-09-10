"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";
import { absoluteUrl } from "@/lib/jsonld";

// Public account sign up/in/out — uses the same Supabase Auth user pool as
// admin login (src/app/admin/login/actions.ts), but never checks/grants
// is_admin(). A public account only becomes an admin by being added to the
// admins table separately; signing up here never does that.

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? ""));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // The final destination after confirming — becomes `{{ .RedirectTo }}`
      // in the email template (supabase/templates/confirmation.html), which
      // itself builds the actual clickable link as
      // `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next={{ .RedirectTo }}`.
      emailRedirectTo: absoluteUrl(next),
    },
  });

  if (error) {
    const message =
      error.code === "user_already_exists"
        ? "An account with this email already exists. Try signing in instead."
        : error.message;
    redirect(`/sign-up?error=${encodeURIComponent(message)}&next=${encodeURIComponent(next)}`);
  }

  // With email confirmations required (supabase/config.toml), signUp()
  // succeeds but returns no session yet — the account can't sign in until
  // the confirmation link (see /auth/confirm) is used.
  if (!data.session) {
    redirect(
      `/sign-in?notice=${encodeURIComponent("Check your email to confirm your account, then sign in.")}&next=${encodeURIComponent(next)}`,
    );
  }

  redirect(next);
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? ""));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // email_not_confirmed is safe to call out explicitly (unlike a
    // wrong-password/no-such-account case, which stays a single generic
    // message so a login attempt can't be used to enumerate accounts).
    const message =
      error.code === "email_not_confirmed"
        ? "Please confirm your email before signing in — check your inbox for the confirmation link."
        : "Invalid email or password.";
    // A photographer sign-in attempt (next targets /photographer) stays on
    // the photographer sign-in flow instead of bouncing to the generic
    // customer page — same reasoning as /auth/confirm's error path.
    const signInPath = next.startsWith("/photographer") ? "/sign-in/photographer?mode=login" : "/sign-in";
    const separator = signInPath.includes("?") ? "&" : "?";
    redirect(
      `${signInPath}${separator}error=${encodeURIComponent(message)}&next=${encodeURIComponent(next)}`,
    );
  }

  redirect(next);
}

/** Resends the signup confirmation email. Prefers the current session's
 * own address when one exists (can't be spoofed). Supabase issues no
 * session at all until the confirmation link is used, so the primary case
 * — a photographer/customer on the post-signup waiting screen — has none
 * yet; for that case this falls back to the `email` carried through from
 * the signup form itself (a hidden field, not something typed fresh on
 * this screen). This is still safe with no session: supabase.auth.resend()
 * only ever affects a real pending unconfirmed signup for that address and
 * never reveals whether one exists, so it can't be used to enumerate or
 * spam an arbitrary account beyond Supabase's own rate limiting
 * (supabase/config.toml max_frequency). A no-op if already verified or if
 * there's no email to act on either way. */
export async function resendConfirmationEmail(formData: FormData) {
  // Two different destinations: `return_to` is where THIS action sends the
  // browser back to right now (the waiting screen, so "resent" shows up);
  // `next` is where a successful confirmation should land, same as it
  // would have for the original signup email — resending must not change
  // that. Defaults match signUp()'s own default.
  const returnTo = safeNextPath(String(formData.get("return_to") ?? ""));
  const confirmNext = safeNextPath(String(formData.get("next") ?? ""));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = user?.email ?? String(formData.get("email") ?? "").trim();
  if (!email || user?.email_confirmed_at) {
    redirect(returnTo);
  }

  await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: absoluteUrl(confirmNext) },
  });

  const separator = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${separator}resent=1`);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
