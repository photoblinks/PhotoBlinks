"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { recordActivityFor } from "@/lib/activity";
import { CACHE_TAGS } from "@/lib/public-data";
import { revalidatePublicContent } from "@/lib/revalidate-public";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedStaffUser, PERMISSION } from "@/lib/supabase/require-permission";
import { isValidCountryState } from "@/lib/supabase/require-photographer";
import { isGoogleUrl, isYouTubeUrl } from "@/lib/photographer-options";
import { isAllowedR2ImageUrl } from "@/lib/r2/upload";
import type { PhotographerStatus } from "./types";

// Every action re-checks the role/permission gate server-side; writes go through the
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
  youtube_url: httpsUrl("Enter a valid YouTube URL.").refine(
    (v) => v === undefined || isYouTubeUrl(v),
    "Enter a youtube.com or youtu.be link.",
  ),
  portfolio_url: httpsUrl("Enter a valid portfolio URL."),
  google_business_url: httpsUrl("Enter a valid Google Business Profile link.").refine(
    (v) => v === undefined || isGoogleUrl(v),
    "Enter a Google link (google.com, g.page, goo.gl or maps.app.goo.gl).",
  ),
  google_maps_url: httpsUrl("Enter a valid Google Maps link.").refine(
    (v) => v === undefined || isGoogleUrl(v),
    "Enter a Google link (google.com, g.page, goo.gl or maps.app.goo.gl).",
  ),
  logo_url: z.string().trim().max(500).optional(),
  banner_url: z.string().trim().max(500).optional(),
  seo_title: z.string().trim().max(120, "Title tag must be 120 characters or fewer.").optional(),
  seo_h1: z.string().trim().max(120, "H1 must be 120 characters or fewer.").optional(),
  seo_description: z.string().trim().max(320, "Meta description must be 320 characters or fewer.").optional(),
});

const idSchema = z.string().uuid();

export async function updatePhotographerProfileByAdmin(id: string, formData: FormData) {
  const base = `/admin/photographer-profiles/${id}`;
  if (!idSchema.safeParse(id).success) redirect("/admin/photographer-profiles");
  if (!(await getAuthorizedStaffUser())?.can(PERMISSION.PHOTOGRAPHERS_EDIT)) redirect("/admin/login");

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
      youtube_url: String(formData.get("youtube_url") ?? "").trim() || undefined,
      seo_title: String(formData.get("seo_title") ?? "").trim() || undefined,
      seo_h1: String(formData.get("seo_h1") ?? "").trim() || undefined,
      seo_description: String(formData.get("seo_description") ?? "").trim() || undefined,
      portfolio_url: String(formData.get("portfolio_url") ?? "").trim() || undefined,
      google_business_url: String(formData.get("google_business_url") ?? "").trim() || undefined,
      google_maps_url: String(formData.get("google_maps_url") ?? "").trim() || undefined,
      logo_url: String(formData.get("logo_url") ?? "").trim() || undefined,
      banner_url: String(formData.get("banner_url") ?? "").trim() || undefined,
    });
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues[0].message : "Invalid form data.";
    redirect(`${base}?error=${encodeURIComponent(message)}`);
  }

  const supabase = await createClient();
  if (!(await isValidCountryState(supabase, values.country_id, values.state_id))) {
    redirect(`${base}?error=${encodeURIComponent("Select a valid country and state.")}`);
  }
  // Images must be this account's own R2 uploads, never an arbitrary URL.
  for (const url of [values.logo_url, values.banner_url]) {
    if (url && !isAllowedR2ImageUrl(url)) {
      redirect(`${base}?error=${encodeURIComponent("Invalid image. Please upload it again.")}`);
    }
  }

  // Optional fields cleared in the form must be nulled, not left unchanged.
  const { data, error } = await supabase
    .from("photographer_profiles")
    .update({
      ...values,
      bio: values.bio ?? null,
      instagram_url: values.instagram_url ?? null,
      youtube_url: values.youtube_url ?? null,
      seo_title: values.seo_title ?? null,
      seo_h1: values.seo_h1 ?? null,
      seo_description: values.seo_description ?? null,
      portfolio_url: values.portfolio_url ?? null,
      google_business_url: values.google_business_url ?? null,
      google_maps_url: values.google_maps_url ?? null,
      logo_url: values.logo_url ?? null,
      banner_url: values.banner_url ?? null,
    })
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("[updatePhotographerProfileByAdmin] update failed:", error.message);
    const message =
      error.code === "23505"
        ? "This phone number is already registered with another account."
        : "Could not save changes. Please try again.";
    redirect(`${base}?error=${encodeURIComponent(message)}`);
  }
  if (!data || data.length === 0) redirect("/admin/photographer-profiles");

  revalidatePublicContent(CACHE_TAGS.photographers);
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
  const staff = await getAuthorizedStaffUser();
  // Employees may only activate; hold and suspend stay admin-only (the
  // protect_photographer_status_fields trigger enforces the same split).
  const allowed = status === "active" ? staff?.can(PERMISSION.PHOTOGRAPHERS_PUBLISH) : staff?.isAdmin;
  if (!allowed) return { error: "Not authorized." };
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

  // A profile can only go live once its owner has verified their email.
  // Unclaimed (bulk-imported) profiles have no owner yet, so nothing to verify.
  if (status === "active") {
    const { data: profile } = await supabase.from("photographer_profiles").select("user_id").eq("id", id).maybeSingle();
    if (!profile) return { error: "This photographer no longer exists." };
    const { data: verified } = profile.user_id
      ? await supabase.rpc("is_email_verified", { p_user: profile.user_id })
      : { data: true };
    if (verified !== true) return { error: "Email not verified yet. Ask the photographer to verify their email first." };
  }

  const { data, error } = await supabase
    .from("photographer_profiles")
    .update(patch)
    .eq("id", id)
    .select("id");
  if (error) return { error: "Could not update status. Please try again." };
  if (!data || data.length === 0) return { error: "This photographer no longer exists." };

  if (status === "active") {
    await recordActivityFor(supabase, {
      module: "photographers",
      action: "published",
      entity_id: id,
    });
  }

  revalidatePublicContent(CACHE_TAGS.photographers);
  revalidatePath("/admin/photographer-profiles");
  revalidatePath("/admin/photographer-requests");
  revalidatePath(`/admin/photographer-profiles/${id}`);
  return { ok: true };
}

/** Grants or removes the blue "verified" tick. The DB trigger
 * protect_photographer_status_fields also blocks non-admins from changing it. */
export async function setPhotographerVerified(id: string, formData: FormData) {
  const base = `/admin/photographer-profiles/${id}`;
  if (!idSchema.safeParse(id).success) redirect("/admin/photographer-profiles");
  if (!(await getAuthorizedStaffUser())?.isAdmin) redirect("/admin/login");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("photographer_profiles")
    .update({ is_verified: formData.get("verified") === "true" })
    .eq("id", id)
    .select("id");
  if (error || !data || data.length === 0) {
    redirect(`${base}?error=${encodeURIComponent("Could not update the verified badge.")}`);
  }

  revalidatePublicContent(CACHE_TAGS.photographers);
  revalidatePath(base);
  redirect(`${base}?success=1`);
}
