"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isPhotographerUser, isValidCountryState } from "@/lib/supabase/require-photographer";

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

export async function updatePhotographerProfile(formData: FormData) {
  const supabase = await createClient();

  // user_id always from the server session — never from the form.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in/photographer");

  // Re-verify active photographer status in the action (not just the layout).
  if (!(await isPhotographerUser(supabase, user.id))) {
    redirect("/photographer/signup");
  }

  let values: ReturnType<typeof parseProfileForm>;
  try {
    values = parseProfileForm(formData);
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues[0].message : "Invalid form data.";
    redirect(`/photographer/profile?error=${encodeURIComponent(message)}`);
  }

  // The dropdown only ever lists real, active countries/states, but the
  // submitted ids are still just form input — re-verify server-side
  // rather than trusting the browser's id/label pairing.
  if (!(await isValidCountryState(supabase, values.country_id, values.state_id))) {
    redirect(`/photographer/profile?error=${encodeURIComponent("Select a valid country and state.")}`);
  }

  // RLS own_update policy (user_id = auth.uid()) prevents updating another
  // user's row even if the action were called directly.
  const { error } = await supabase
    .from("photographer_profiles")
    .update(values)
    .eq("user_id", user.id);

  if (error) {
    redirect(`/photographer/profile?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/photographer/profile?success=1");
}
