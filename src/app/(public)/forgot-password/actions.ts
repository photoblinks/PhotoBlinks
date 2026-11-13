"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createStatelessClient } from "@/lib/supabase/stateless";
import { CAPTCHA_FAILED_MESSAGE, verifyTurnstile } from "@/lib/turnstile";
import { allowAction, allowByIp } from "@/lib/rate-limit";

/** Emails a set/reset-password link. The reply is identical whether or not
 * the address has an account, so this cannot be used to discover accounts.
 * The link's destination (/set-password) is fixed in the recovery email
 * template, never taken from the request. */
export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const back = (query: string) => redirect(`/forgot-password?${query}`);

  if (!email || email.length > 320 || !email.includes("@")) back(`error=${encodeURIComponent("Enter a valid email address.")}`);
  if (!(await verifyTurnstile(formData.get("cf-turnstile-response")))) {
    back(`error=${encodeURIComponent(CAPTCHA_FAILED_MESSAGE)}`);
  }

  const supabase = await createClient();
  if (
    (await allowByIp(supabase, "reset:ip", 10, 3600)) &&
    (await allowAction(supabase, `reset:e:${email}`, 3, 3600))
  ) {
    const { error } = await createStatelessClient().auth.resetPasswordForEmail(email);
    if (error) console.error("requestPasswordReset failed", { code: error.code, status: error.status });
  }

  back("sent=1");
}
