import type { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/slug";
import {
  checkCountryStateSelection,
  identityKey,
  normalizeName,
  type BulkImportReference,
} from "./validate";
import type { ParsedRow } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** Loads the server-side reference data (country/state, active categories,
 * state cities, existing locations/slugs) used by both the Phase 3 validate
 * route and the Phase 4 create route. Never trusts client-supplied IDs: the
 * country/state selection is re-verified against the database every call. */
export async function loadBulkImportReference(
  supabase: SupabaseServerClient,
  countryId: string,
  stateId: string,
  rows: ParsedRow[],
): Promise<{ ok: true; reference: BulkImportReference } | { ok: false; error: string }> {
  const [{ data: country }, { data: state }, { data: categories }, { data: cities }, { data: stateLocations }] =
    await Promise.all([
      supabase.from("countries").select("id, name").eq("id", countryId).maybeSingle(),
      supabase.from("states").select("id, name, country_id").eq("id", stateId).maybeSingle(),
      supabase.from("categories").select("id, name").eq("is_active", true).order("sort_order"),
      supabase.from("cities").select("id, name, slug").eq("state_id", stateId),
      supabase.from("locations").select("name, slug, city_id").eq("state_id", stateId),
    ]);

  const countryState = checkCountryStateSelection(country, state);
  if (!countryState.ok) return { ok: false, error: countryState.error };
  // Narrowed non-null: the helper only returns ok when both exist.
  const selectedCountry = country!;
  const selectedState = state!;

  // Slug uniqueness is global on the locations table (slug unique), so check
  // every candidate slug in one batched query rather than per row.
  const candidateSlugs = [
    ...new Set(rows.map((row) => slugify(row.values.name)).filter(Boolean)),
  ];
  const slugCheck =
    candidateSlugs.length > 0
      ? await supabase.from("locations").select("slug").in("slug", candidateSlugs)
      : { data: [] as { slug: string }[] };

  const categoriesByName = new Map<string, { id: string; name: string }>();
  for (const category of categories ?? []) {
    categoriesByName.set(normalizeName(category.name), category);
  }

  const citiesBySlug = new Map<string, { id: string; name: string; slug: string }>();
  const cityIdToSlug = new Map<string, string>();
  for (const city of cities ?? []) {
    citiesBySlug.set(city.slug, city);
    cityIdToSlug.set(city.id, city.slug);
  }

  const existingLocationIdentityKeys = new Set<string>();
  const existingSlugs = new Set<string>();
  for (const location of stateLocations ?? []) {
    existingSlugs.add(location.slug);
    const citySlug = cityIdToSlug.get(location.city_id);
    if (citySlug) {
      existingLocationIdentityKeys.add(identityKey(location.name, citySlug, selectedState.id));
    }
  }
  for (const row of slugCheck.data ?? []) {
    existingSlugs.add(row.slug);
  }

  return {
    ok: true,
    reference: {
      countryId: selectedCountry.id,
      countryName: selectedCountry.name,
      stateId: selectedState.id,
      stateName: selectedState.name,
      categoriesByName,
      citiesBySlug,
      existingLocationIdentityKeys,
      existingSlugs,
    },
  };
}
