"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function parseSeoForm(formData: FormData) {
  return {
    meta_title: String(formData.get("meta_title") ?? "").trim() || null,
    meta_description: String(formData.get("meta_description") ?? "").trim() || null,
  };
}

/** Resolves the live public City + Category URL for a (city, category) pair
 * so a save/reset can revalidate that exact route — mirrors the nested
 * city→state→country select used by the city-pages edit page. */
async function resolvePublicPath(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cityId: string,
  categoryId: string,
) {
  const [{ data: city }, { data: category }] = await Promise.all([
    supabase
      .from("cities")
      .select("slug, states(slug, countries(slug))")
      .eq("id", cityId)
      .single(),
    supabase.from("categories").select("slug").eq("id", categoryId).single(),
  ]);
  if (!city || !category) return null;

  const state = Array.isArray(city.states) ? city.states[0] : city.states;
  const countryRaw = state && (Array.isArray(state.countries) ? state.countries[0] : state.countries);
  if (!state?.slug || !countryRaw?.slug) return null;

  return `/locations/${countryRaw.slug}/${state.slug}/${city.slug}/${category.slug}`;
}

/** Busts both the cached override lookup (data layer, via `updateTag` —
 * immediate expiration, read-your-own-writes, only callable from a Server
 * Action) and the public route's cached render (route layer, via
 * `revalidatePath`) — `updateTag` alone isn't enough because the route's
 * own rendered output can still be served from the Full Route Cache
 * without re-running generateMetadata. */
async function revalidatePublicCategoryPage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cityId: string,
  categoryId: string,
) {
  updateTag("location-category-seo");
  const path = await resolvePublicPath(supabase, cityId, categoryId);
  if (path) revalidatePath(path);
  revalidatePath("/admin/seo/location-categories");
}

export async function saveLocationCategorySeo(
  cityId: string,
  categoryId: string,
  returnTo: string,
  formData: FormData,
) {
  const supabase = await createClient();
  const values = parseSeoForm(formData);
  const editPath = `/admin/seo/location-categories/${cityId}/${categoryId}/edit`;

  // Both fields empty means "use defaults" — delete any existing override
  // row rather than persisting empty strings as if they were custom values.
  const { error } =
    values.meta_title || values.meta_description
      ? await supabase
          .from("location_category_seo")
          .upsert(
            { city_id: cityId, category_id: categoryId, ...values },
            { onConflict: "city_id,category_id" },
          )
      : await supabase
          .from("location_category_seo")
          .delete()
          .eq("city_id", cityId)
          .eq("category_id", categoryId);

  if (error) {
    redirect(
      `${editPath}?error=${encodeURIComponent(error.message)}&returnTo=${encodeURIComponent(returnTo)}`,
    );
  }

  await revalidatePublicCategoryPage(supabase, cityId, categoryId);
  redirect(returnTo || "/admin/seo/location-categories");
}

export async function resetLocationCategorySeo(cityId: string, categoryId: string, returnTo: string) {
  const supabase = await createClient();
  const editPath = `/admin/seo/location-categories/${cityId}/${categoryId}/edit`;

  const { error } = await supabase
    .from("location_category_seo")
    .delete()
    .eq("city_id", cityId)
    .eq("category_id", categoryId);

  if (error) {
    redirect(
      `${editPath}?error=${encodeURIComponent(error.message)}&returnTo=${encodeURIComponent(returnTo)}`,
    );
  }

  await revalidatePublicCategoryPage(supabase, cityId, categoryId);
  redirect(returnTo || "/admin/seo/location-categories");
}
