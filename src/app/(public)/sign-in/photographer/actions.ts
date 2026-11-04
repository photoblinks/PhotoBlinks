"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { absoluteUrl } from "@/lib/jsonld";
import { CAPTCHA_FAILED_MESSAGE, verifyTurnstile } from "@/lib/turnstile";
import { SIGNUP_RATE_LIMITED_MESSAGE, allowSignup } from "@/lib/rate-limit";
import { sendVerificationEmail } from "@/lib/auth-verification";
import { isValidCountryState } from "@/lib/supabase/require-photographer";

// Same permissive rule used everywhere else in the app for phone numbers.
const PHONE_REGEX = /^[\d+\s-]{7,20}$/;

const signupSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(1, "Full name is required.")
    .max(200, "Full name must be 200 characters or fewer."),
  studio_name: z
    .string()
    .trim()
    .min(1, "Photography studio name is required.")
    .max(200, "Studio name must be 200 characters or fewer."),
  country_id: z.string().trim().uuid("Select a country."),
  state_id: z.string().trim().uuid("Select a state."),
  city: z.string().trim().min(1, "City is required.").max(100, "City must be 100 characters or fewer."),
  phone_number: z.string().trim().regex(PHONE_REGEX, "Enter a valid phone number."),
  whatsapp_number: z.string().trim().regex(PHONE_REGEX, "Enter a valid WhatsApp number."),
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});

/** Returned (instead of redirecting) on a validation/signup failure so the
 * form can show the error and keep what the user typed. Password is never
 * echoed back. */
export type PhotographerSignupState = {
  error: string;
  values: Record<string, string>;
} | null;

/** Combined account + photographer-profile signup, submitted from the
 * branded /sign-in/photographer page. Uses the exact same Supabase Auth
 * user pool and signUp() call as the generic customer signup
 * (src/lib/auth-actions.ts) — this is not a second auth system, just a
 * form that also carries photographer-only fields.
 *
 * Email confirmations are required (supabase/config.toml), so signUp()
 * returns no session in the normal case — there is no auth.uid() yet for
 * RLS to check, so the profile row is NOT inserted here. The profile
 * fields are instead stashed in signUp() metadata (becomes
 * auth.users.raw_user_meta_data) and picked up by the shell layout
 * (ensurePhotographerProfileFromMetadata) once the confirmation link
 * establishes a real session — no service-role client, no manufactured
 * session, nothing bypasses the confirmation requirement.
 *
 * Redirects to /photographer either way, session or not: with no session,
 * the dashboard page itself renders an "email verification pending"
 * view (no real data to show yet regardless — the profile doesn't exist
 * until confirmation) instead of bouncing to a separate page. */
export async function signUpPhotographer(
  _prev: PhotographerSignupState,
  formData: FormData,
): Promise<PhotographerSignupState> {
  const entered: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && key !== "password") entered[key] = value;
  }
  const fail = (error: string): PhotographerSignupState => ({ error, values: entered });

  let values: z.infer<typeof signupSchema>;
  try {
    values = signupSchema.parse({
      full_name: String(formData.get("full_name") ?? ""),
      studio_name: String(formData.get("studio_name") ?? ""),
      country_id: String(formData.get("country_id") ?? ""),
      state_id: String(formData.get("state_id") ?? ""),
      city: String(formData.get("city") ?? ""),
      phone_number: String(formData.get("phone_number") ?? ""),
      whatsapp_number: String(formData.get("whatsapp_number") ?? ""),
      email: String(formData.get("email") ?? "").toLowerCase(),
      password: String(formData.get("password") ?? ""),
    });
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues[0].message : "Invalid form data.";
    return fail(message);
  }

  if (!(await verifyTurnstile(formData.get("cf-turnstile-response")))) return fail(CAPTCHA_FAILED_MESSAGE);

  const supabase = await createClient();
  if (!(await allowSignup(supabase))) return fail(SIGNUP_RATE_LIMITED_MESSAGE);

  // Phone numbers are unique per account; checked before the auth user exists
  // so a duplicate never leaves an orphan account behind.
  const { data: phoneTaken } = await supabase.rpc("photographer_phone_taken", { p_phone: values.phone_number });
  if (phoneTaken === true) return fail("An account with this phone number already exists.");

  // The dropdown only ever lists real, active countries/states, but the
  // submitted ids are still just form input — re-verify server-side that
  // state_id is a real, active state under the real, active country_id
  // before ever storing them (in metadata below, or directly further
  // down). Never trust the browser's id/label pairing on its own. Runs as
  // the signed-out visitor, whose anon role cannot read `states`, so it
  // uses the server-only public client (read-only, is_active filtered).
  if (!(await isValidCountryState(createPublicClient(), values.country_id, values.state_id))) {
    return fail("Select a valid country and state.");
  }
  const { data, error } = await supabase.auth.signUp({
    email: values.email,
    password: values.password,
    options: {
      // Lands the confirmation link on the dashboard route; the shell
      // layout there redirects to /photographer/signup automatically if
      // the profile doesn't exist yet, which is exactly when this
      // metadata gets consumed.
      emailRedirectTo: absoluteUrl("/photographer"),
      data: {
        photographer_signup: true,
        display_name: values.full_name,
        studio_name: values.studio_name,
        country_id: values.country_id,
        state_id: values.state_id,
        city: values.city,
        phone_number: values.phone_number,
        whatsapp_number: values.whatsapp_number,
      },
    },
  });

  if (error) {
    const message =
      error.code === "user_already_exists"
        ? "An account with this email already exists. Try signing in instead."
        : error.message;
    return fail(message);
  }

  if (!data.session || !data.user) {
    redirect(`/photographer?pending_email=${encodeURIComponent(values.email)}`);
  }

  // Edge case: signUp() returned a session immediately (not the expected
  // path with email confirmations required) — finish the profile creation
  // now instead of waiting for /auth/confirm.
  const { error: profileError } = await supabase.from("photographer_profiles").insert({
    user_id: data.user.id,
    display_name: values.full_name,
    studio_name: values.studio_name,
    country_id: values.country_id,
    state_id: values.state_id,
    city: values.city,
    phone_number: values.phone_number,
    whatsapp_number: values.whatsapp_number,
  });
  if (profileError) {
    return fail(
      profileError.code === "23505"
        ? "An account with this phone number already exists."
        : profileError.message,
    );
  }

  await sendVerificationEmail(supabase, values.email, "/photographer");
  redirect("/photographer");
}
