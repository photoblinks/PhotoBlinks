"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createStatelessClient } from "@/lib/supabase/stateless";
import { CAPTCHA_FAILED_MESSAGE, verifyTurnstile } from "@/lib/turnstile";
import { allowAction, allowByIp } from "@/lib/rate-limit";

// Claim flow: the visitor proves ownership of an email with a one-time code,
// sets their password, and files a claim request for admin approval. Nothing
// here assigns a profile — only approve_photographer_claim (admin) does. The
// code request runs on a stateless client; verifying the code signs the
// claimant in (browser session) so they land on the photographer dashboard.

export type ClaimableProfile = { id: string; studio_name: string; city: string; state_name: string };

export async function searchClaimableProfiles(query: string): Promise<ClaimableProfile[]> {
  const q = query.trim().slice(0, 100);
  if (q.length < 3) return [];
  const supabase = await createClient();
  if (!(await allowByIp(supabase, "claim:search", 60, 600))) return [];
  const { data } = await supabase.rpc("search_claimable_photographers", { p_query: q });
  return (data ?? []) as ClaimableProfile[];
}

const PHONE_REGEX = /^[\d+\s-]{7,20}$/;

const claimSchema = z.object({
  profile_id: z.string().uuid("Select your profile from the search results."),
  full_name: z.string().trim().min(1, "Full name is required.").max(200),
  studio_name: z.string().trim().min(1, "Photography name is required.").max(200),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(320),
  password: z.string().min(6, "Password must be at least 6 characters.").max(72),
  phone_number: z.string().trim().regex(PHONE_REGEX, "Enter a valid phone number."),
  proof_url: z
    .string()
    .trim()
    .url("Enter a valid link to your Instagram or portfolio.")
    .max(500)
    .refine((v) => v.startsWith("https://"), "The link must start with https://"),
  message: z.string().trim().min(1, "Tell us how you can be verified.").max(1000, "Message must be 1000 characters or fewer."),
});

export type ClaimValues = Record<string, string>;
export type ClaimStepResult =
  | { step: "code"; values: ClaimValues; error?: undefined }
  | { step?: undefined; error: string; values: ClaimValues }
  | null;
export type ClaimSubmitResult = { error: string } | null;

function readValues(formData: FormData): ClaimValues {
  const values: ClaimValues = {};
  for (const key of ["profile_id", "full_name", "studio_name", "email", "phone_number", "proof_url", "message"]) {
    values[key] = String(formData.get(key) ?? "");
  }
  return values;
}

// The password is validated with the rest but kept out of readValues so it is
// never echoed back to the browser in an action result.
function parseClaim(formData: FormData) {
  return claimSchema.safeParse({ ...readValues(formData), password: String(formData.get("password") ?? "") });
}

/** Step 1: validate the form and email a one-time code. */
export async function requestClaimCode(_prev: ClaimStepResult, formData: FormData): Promise<ClaimStepResult> {
  const values = readValues(formData);
  const parsed = parseClaim(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };

  if (!(await verifyTurnstile(formData.get("cf-turnstile-response")))) {
    return { error: CAPTCHA_FAILED_MESSAGE, values };
  }

  const supabase = await createClient();
  if (
    !(await allowByIp(supabase, "claim:otp", 10, 3600)) ||
    !(await allowAction(supabase, `claim:otp:e:${parsed.data.email}`, 3, 3600))
  ) {
    return { error: "Too many attempts. Please try again later.", values };
  }

  const { error } = await createStatelessClient().auth.signInWithOtp({
    email: parsed.data.email,
    // data marks the account as a photographer sign-up so it stays out of the
    // admin Users list while the claim is pending.
    options: { shouldCreateUser: true, data: { photographer_signup: true } },
  });
  if (error) {
    console.error("requestClaimCode: signInWithOtp failed", { code: error.code, status: error.status });
    return { error: "Could not send the verification code. Please try again in a moment.", values };
  }

  return { step: "code", values: { ...values, email: parsed.data.email } };
}

/** Step 2: verify the code (proves the email is theirs), set the password,
 * file the claim and send the claimant to the dashboard's pending view. */
export async function submitClaim(_prev: ClaimSubmitResult, formData: FormData): Promise<ClaimSubmitResult> {
  const parsed = parseClaim(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const code = String(formData.get("code") ?? "").trim();
  if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code from your email." };

  const supabase = await createClient();
  if (
    !(await allowByIp(supabase, "claim:verify", 20, 3600)) ||
    !(await allowAction(supabase, `claim:verify:e:${parsed.data.email}`, 8, 3600))
  ) {
    return { error: "Too many attempts. Please try again later." };
  }

  const v = parsed.data;
  const { error: verifyError } = await supabase.auth.verifyOtp({ email: v.email, token: code, type: "email" });
  if (verifyError) return { error: "That code is invalid or has expired. Check the code or go back to request a new one." };

  // The OTP session is the proof of email ownership this RPC requires.
  await supabase.rpc("mark_email_verified");

  // Email + this password become the login. "same_password" just means the
  // account already had it.
  const { error: passwordError } = await supabase.auth.updateUser({ password: v.password });
  if (passwordError && passwordError.code !== "same_password") {
    console.error("submitClaim: updateUser failed", { code: passwordError.code, status: passwordError.status });
    return { error: passwordError.message };
  }

  const { error } = await supabase.rpc("submit_photographer_claim", {
    p_profile_id: v.profile_id,
    p_full_name: v.full_name,
    p_studio_name: v.studio_name,
    p_phone_number: v.phone_number,
    p_proof_url: v.proof_url,
    p_message: v.message,
  });
  if (error) {
    // Raised exceptions (P0001) carry a message written for the claimant.
    if (error.code === "P0001") return { error: error.message };
    if (error.code === "23505") return { error: "You have already sent a claim request for this profile." };
    console.error("submitClaim: submit_photographer_claim failed", { code: error.code });
    return { error: "Could not submit your claim. Please try again." };
  }

  redirect("/photographer");
}
