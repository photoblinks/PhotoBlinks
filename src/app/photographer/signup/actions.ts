"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isValidCountryState } from "@/lib/supabase/require-photographer";
import { safeNextPath } from "@/lib/safe-redirect";

// Same permissive rule as src/app/admin/(shell)/photographers/actions.ts.
// Accepts Indian mobile numbers with or without +91 prefix, spaces, or dashes.
const PHONE_REGEX = /^[\d+\s-]{7,20}$/;

const profileSchema = z.object({
  display_name: z
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
  bio: z.string().trim().max(1000, "Bio must be 1000 characters or fewer.").optional(),
  phone_number: z.string().trim().regex(PHONE_REGEX, "Enter a valid phone number."),
  whatsapp_number: z.string().trim().regex(PHONE_REGEX, "Enter a valid WhatsApp number."),
  instagram_url: z
    .string()
    .trim()
    .url("Enter a valid Instagram URL.")
    .refine((v) => v.startsWith("https://"), "URL must use HTTPS.")
    .optional(),
  portfolio_url: z
    .string()
    .trim()
    .url("Enter a valid portfolio URL.")
    .refine((v) => v.startsWith("https://"), "URL must use HTTPS.")
    .optional(),
});

function parseProfileForm(formData: FormData) {
  return profileSchema.parse({
    display_name: String(formData.get("display_name") ?? ""),
    studio_name: String(formData.get("studio_name") ?? ""),
    country_id: String(formData.get("country_id") ?? ""),
    state_id: String(formData.get("state_id") ?? ""),
    city: String(formData.get("city") ?? ""),
    bio: String(formData.get("bio") ?? "").trim() || undefined,
    phone_number: String(formData.get("phone_number") ?? ""),
    whatsapp_number: String(formData.get("whatsapp_number") ?? ""),
    instagram_url: String(formData.get("instagram_url") ?? "").trim() || undefined,
    portfolio_url: String(formData.get("portfolio_url") ?? "").trim() || undefined,
  });
}

export async function createPhotographerProfile(formData: FormData) {
  // Both the standalone /photographer/signup form and the mandatory
  // completion popup on the dashboard (CompleteProfileModal) submit to
  // this same action — return_to says which one to bounce back to on
  // error, so a validation failure never yanks the dashboard-modal user
  // over to the standalone page (or vice versa). safeNextPath guards it
  // against being turned into an open redirect.
  const returnTo = safeNextPath(String(formData.get("return_to") ?? ""), "/photographer/signup");

  const supabase = await createClient();

  // user_id always comes from the server session — never from the form.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in/photographer");

  // Check for any existing profile (active or suspended).
  const { data: existing } = await supabase
    .from("photographer_profiles")
    .select("is_active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    if (existing.is_active) {
      redirect("/photographer");
    }
    redirect(
      `${returnTo}?error=${encodeURIComponent("Your photographer account is suspended. Please contact support.")}`,
    );
  }

  let values: ReturnType<typeof parseProfileForm>;
  try {
    values = parseProfileForm(formData);
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues[0].message : "Invalid form data.";
    redirect(`${returnTo}?error=${encodeURIComponent(message)}`);
  }

  // The dropdown only ever lists real, active countries/states, but the
  // submitted ids are still just form input — re-verify server-side
  // rather than trusting the browser's id/label pairing.
  if (!(await isValidCountryState(supabase, values.country_id, values.state_id))) {
    redirect(`${returnTo}?error=${encodeURIComponent("Select a valid country and state.")}`);
  }

  const { error } = await supabase.from("photographer_profiles").insert({
    ...values,
    user_id: user.id,
  });

  if (error) {
    redirect(`${returnTo}?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/photographer");
}
