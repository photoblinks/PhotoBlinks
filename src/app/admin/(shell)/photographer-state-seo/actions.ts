"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CACHE_TAGS } from "@/lib/public-data";
import { revalidatePublicContent } from "@/lib/revalidate-public";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedAdminUser } from "@/lib/supabase/require-admin";

const idSchema = z.string().uuid();
const citySlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

function field(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim() || null;
}

/** Saves the banner / H1 / title tag / meta description for a photographer
 * State page (citySlug null) or City page. Select-then-write: the unique
 * indexes are partial, so they can't be a supabase upsert target. */
export async function savePhotographerGeoSeo(stateId: string, citySlug: string | null, formData: FormData) {
  const section = citySlug ? "photographer-city-seo" : "photographer-state-seo";
  const back = citySlug ? `/admin/${section}/${stateId}/${citySlug}/edit` : `/admin/${section}/${stateId}/edit`;
  if (!idSchema.safeParse(stateId).success || (citySlug !== null && !citySlugSchema.safeParse(citySlug).success)) {
    redirect(`/admin/${section}`);
  }
  if (!(await getAuthorizedAdminUser())) redirect("/admin/login");

  const values = {
    image_url: field(formData, "image_url"),
    h1_title: field(formData, "h1_title"),
    meta_title: field(formData, "meta_title"),
    meta_description: field(formData, "meta_description"),
  };

  const supabase = await createClient();
  let match = supabase.from("photographer_geo_seo").select("id").eq("state_id", stateId);
  match = citySlug ? match.eq("city_slug", citySlug) : match.is("city_slug", null);
  const { data: existing, error: loadError } = await match.maybeSingle();
  if (loadError) redirect(`${back}?error=${encodeURIComponent("Could not load existing SEO settings.")}`);

  const { error } = existing
    ? await supabase.from("photographer_geo_seo").update(values).eq("id", existing.id)
    : await supabase.from("photographer_geo_seo").insert({ ...values, state_id: stateId, city_slug: citySlug });
  if (error) redirect(`${back}?error=${encodeURIComponent(error.message)}`);

  revalidatePublicContent(CACHE_TAGS.photographers);
  revalidatePath(`/admin/${section}`);
  redirect(`/admin/${section}`);
}
