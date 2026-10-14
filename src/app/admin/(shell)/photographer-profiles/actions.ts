"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedAdminUser } from "@/lib/supabase/require-admin";
import { isValidCountryState } from "@/lib/supabase/require-photographer";
import type { PhotographerStatus } from "./types";

// Every action re-checks the admin gate server-side; writes go through the
// request-scoped client so the photographer_profiles admin_all RLS policy and
// the protect_photographer_status_fields trigger still apply.

const PHONE_REGEX = /^[\d+\s-]{7,20}$/;

const httpsUrl = (message: string) =>
  z
    .string()
    .trim()
    .url(message)
    .refine((v) => v.startsWith("https://"), "URL must use HTTPS.")
    .optional();

const profileSchema = z.object({
  display_name: z.string().trim().min(1, "Full name is required.").max(200, "Full name must be 200 characters or fewer."),
  studio_name: z.string().trim().min(1, "Studio name is required.").max(200, "Studio name must be 200 characters or fewer."),
  country_id: z.string().trim().uuid("Select a country."),
  state_id: z.string().trim().uuid("Select a state."),
  city: z.string().trim().min(1, "City is required.").max(100, "City must be 100 characters or fewer."),
  bio: z.string().trim().max(1000, "Bio must be 1000 characters or fewer.").optional(),
  phone_number: z.string().trim().regex(PHONE_REGEX, "Enter a valid phone number."),
  whatsapp_number: z.string().trim().regex(PHONE_REGEX, "Enter a valid WhatsApp number."),
  instagram_url: httpsUrl("Enter a valid Instagram URL."),
  portfolio_url: httpsUrl("Enter a valid portfolio URL."),
});

const idSchema = z.string().uuid();

export async function updatePhotographerProfileByAdmin(id: string, formData: FormData) {
  const base = `/admin/photographer-profiles/${id}`;
  if (!idSchema.safeParse(id).success) redirect("/admin/photographer-profiles");
  if (!(await getAuthorizedAdminUser())) redirect("/admin/login");

  let values: z.infer<typeof profileSchema>;
  try {
    values = profileSchema.parse({
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
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues[0].message : "Invalid form data.";
    redirect(`${base}?error=${encodeURIComponent(message)}`);
  }

  const supabase = await createClient();
  if (!(await isValidCountryState(supabase, values.country_id, values.state_id))) {
    redirect(`${base}?error=${encodeURIComponent("Select a valid country and state.")}`);
  }

  // Optional fields cleared in the form must be nulled, not left unchanged.
  const { data, error } = await supabase
    .from("photographer_profiles")
    .update({
      ...values,
      bio: values.bio ?? null,
      instagram_url: values.instagram_url ?? null,
      portfolio_url: values.portfolio_url ?? null,
    })
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("[updatePhotographerProfileByAdmin] update failed:", error.message);
    redirect(`${base}?error=${encodeURIComponent("Could not save changes. Please try again.")}`);
  }
  if (!data || data.length === 0) redirect("/admin/photographer-profiles");

  revalidatePath("/admin/photographer-profiles");
  redirect(`${base}?success=1`);
}

export type PhotographerStatusResult = { ok: true } | { error: string };

/** active: is_active=true, suspended_at=null.
 * on_hold: is_active=false, suspended_at=null.
 * suspended: is_active=false, suspended_at=now(). */
export async function setPhotographerStatus(
  id: string,
  status: PhotographerStatus,
): Promise<PhotographerStatusResult> {
  if (!(await getAuthorizedAdminUser())) return { error: "Not authorized." };
  if (!idSchema.safeParse(id).success) return { error: "Invalid photographer." };

  const patch =
    status === "active"
      ? { is_active: true, suspended_at: null }
      : status === "on_hold"
        ? { is_active: false, suspended_at: null }
        : status === "suspended"
          ? { is_active: false, suspended_at: new Date().toISOString() }
          : null;
  if (!patch) return { error: "Invalid status." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("photographer_profiles")
    .update(patch)
    .eq("id", id)
    .select("id");
  if (error) return { error: "Could not update status. Please try again." };
  if (!data || data.length === 0) return { error: "This photographer no longer exists." };

  revalidatePath("/admin/photographer-profiles");
  revalidatePath(`/admin/photographer-profiles/${id}`);
  return { ok: true };
}
