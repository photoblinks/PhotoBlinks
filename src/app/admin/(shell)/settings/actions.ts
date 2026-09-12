"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedAdminUser } from "@/lib/supabase/require-admin";

export async function updateBannerImages(formData: FormData) {
  const supabase = await createClient();
  const images = formData.getAll("images").map(String).filter(Boolean);

  // Atomic: either every image lands with the right sort_order, or nothing
  // changes — see 20260826000000_replace_site_banner_images_fn.sql.
  const { error } = await supabase.rpc("replace_site_banner_images", { image_urls: images });

  if (error) {
    redirect(`/admin/settings?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/settings");
  revalidatePath("/");
  redirect("/admin/settings?saved=1");
}

// --- Social media links (Admin → Settings → Social Media) -------------------

/** Upper bound for a social profile URL. Far above any realistic handle URL,
 * but prevents an oversized value from ever being stored or rendered. */
const SOCIAL_URL_MAX_LENGTH = 2048;

/** True for a cleared value (null) or an absolute http:/https: URL. The
 * new URL() round-trip normalizes the scheme so javascript:, data:, ftp:
 * and protocol-relative (//host) values can never slip through, and any
 * value that doesn't parse at all is rejected too. */
function isAllowedSocialUrl(value: string | null): boolean {
  if (value === null) return true;
  try {
    const href = new URL(value).href;
    return href.startsWith("http://") || href.startsWith("https://");
  } catch {
    return false;
  }
}

/** Per-platform field schema: trimmed, length-capped, empty → null (clears
 * the stored link), otherwise must be a valid http(s) URL. */
function socialUrlField(label: string) {
  return z
    .string()
    .trim()
    .max(SOCIAL_URL_MAX_LENGTH, `${label} URL must be ${SOCIAL_URL_MAX_LENGTH} characters or fewer.`)
    .transform((value) => (value === "" ? null : value))
    .refine(isAllowedSocialUrl, {
      message: `${label} URL must be a valid http:// or https:// link.`,
    });
}

/** Closed allowlist — exactly the five columns the public footer renders. */
const socialLinksSchema = z.object({
  instagram_url: socialUrlField("Instagram"),
  facebook_url: socialUrlField("Facebook"),
  youtube_url: socialUrlField("YouTube"),
  pinterest_url: socialUrlField("Pinterest"),
  linkedin_url: socialUrlField("LinkedIn"),
});

export async function updateSocialMediaLinks(formData: FormData) {
  // Authorization before any mutation. The admin shell layout already
  // redirects non-admins to /admin/login and RLS (site_settings_admin_all
  // via public.is_admin()) rejects the write at the database — this explicit
  // server-side check means a non-admin request can never reach the update.
  const user = await getAuthorizedAdminUser();
  if (!user) redirect("/admin/login");

  // Browser input is never trusted: every field is re-validated here with
  // the same Zod schema — browser-side validation is purely cosmetic.
  let values;
  try {
    values = socialLinksSchema.parse({
      instagram_url: formData.get("instagram_url") ?? "",
      facebook_url: formData.get("facebook_url") ?? "",
      youtube_url: formData.get("youtube_url") ?? "",
      pinterest_url: formData.get("pinterest_url") ?? "",
      linkedin_url: formData.get("linkedin_url") ?? "",
    });
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues[0].message : "Invalid form data.";
    redirect(`/admin/settings?error=${encodeURIComponent(message)}`);
  }

  const supabase = await createClient();

  // Only the five known fields may be written — the update object is built
  // from the zod-parsed values, never spread from form data.
  const { error } = await supabase
    .from("site_settings")
    .update({
      instagram_url: values.instagram_url,
      facebook_url: values.facebook_url,
      youtube_url: values.youtube_url,
      pinterest_url: values.pinterest_url,
      linkedin_url: values.linkedin_url,
    })
    .eq("id", true);

  if (error) {
    redirect(`/admin/settings?error=${encodeURIComponent(error.message)}`);
  }

  // The footer lives in the public root layout; the settings page itself
  // must reflect the saved values immediately as well.
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
  redirect("/admin/settings?saved=social");
}
