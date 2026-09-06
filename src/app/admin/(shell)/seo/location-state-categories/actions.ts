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

/** Resolves the live public State + Category URL for a (state, category)
 * pair so a save/reset can revalidate that exact route — mirrors the
 * city+category actions' resolvePublicPath one geo level up. */
async function resolvePublicPath(
  supabase: Awaited<ReturnType<typeof createClient>>,
  stateId: string,
  categoryId: string,
) {
  const [{ data: state }, { data: category }] = await Promise.all([
    supabase.from("states").select("slug, countries(slug)").eq("id", stateId).single(),
    supabase.from("categories").select("slug").eq("id", categoryId).single(),
  ]);
  if (!state || !category) return null;

  const countryRaw = Array.isArray(state.countries) ? state.countries[0] : state.countries;
  if (!countryRaw?.slug) return null;

  return `/locations/${countryRaw.slug}/${state.slug}/${category.slug}`;
}

/** Busts both the cached override lookup (data layer, via `updateTag`) and
 * the public route's cached render (route layer, via `revalidatePath`) —
 * mirrors revalidatePublicCategoryPage one geo level up. */
async function revalidatePublicStateCategoryPage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  stateId: string,
  categoryId: string,
) {
  updateTag("location-state-category-seo");
  const path = await resolvePublicPath(supabase, stateId, categoryId);
  if (path) revalidatePath(path);
  revalidatePath("/admin/seo/location-state-categories");
}

export async function saveLocationStateCategorySeo(
  stateId: string,
  categoryId: string,
  returnTo: string,
  formData: FormData,
) {
  const supabase = await createClient();
  const values = parseSeoForm(formData);
  const editPath = `/admin/seo/location-state-categories/${stateId}/${categoryId}/edit`;

  // Both fields empty means "use defaults" — delete any existing override
  // row rather than persisting empty strings as if they were custom values.
  const { error } =
    values.meta_title || values.meta_description
      ? await supabase
          .from("location_state_category_seo")
          .upsert(
            { state_id: stateId, category_id: categoryId, ...values },
            { onConflict: "state_id,category_id" },
          )
      : await supabase
          .from("location_state_category_seo")
          .delete()
          .eq("state_id", stateId)
          .eq("category_id", categoryId);

  if (error) {
    redirect(
      `${editPath}?error=${encodeURIComponent(error.message)}&returnTo=${encodeURIComponent(returnTo)}`,
    );
  }

  await revalidatePublicStateCategoryPage(supabase, stateId, categoryId);
  redirect(returnTo || "/admin/seo/location-state-categories");
}

export async function resetLocationStateCategorySeo(
  stateId: string,
  categoryId: string,
  returnTo: string,
) {
  const supabase = await createClient();
  const editPath = `/admin/seo/location-state-categories/${stateId}/${categoryId}/edit`;

  const { error } = await supabase
    .from("location_state_category_seo")
    .delete()
    .eq("state_id", stateId)
    .eq("category_id", categoryId);

  if (error) {
    redirect(
      `${editPath}?error=${encodeURIComponent(error.message)}&returnTo=${encodeURIComponent(returnTo)}`,
    );
  }

  await revalidatePublicStateCategoryPage(supabase, stateId, categoryId);
  redirect(returnTo || "/admin/seo/location-state-categories");
}
