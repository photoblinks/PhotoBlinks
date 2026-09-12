import { createClient } from "@/lib/supabase/server";

/**
 * Validates that the selected state actually belongs to the selected
 * country, then resolves the typed city name to a city_id — reusing an
 * existing city in that state if one already matches (normalized,
 * case/whitespace-insensitive), or creating it atomically if not (see
 * find_or_create_city). Shared by the location and studio admin forms,
 * which both need the same Country → State → City validation.
 *
 * Throws on any failure — a location/studio is never silently saved with
 * an inconsistent country/state/city relationship. Callers surface the
 * error message to the form the same way as any other validation error.
 */
export async function resolveLocationGeo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: { countryId: string; stateId: string; cityName: string },
): Promise<string> {
  const { countryId, stateId, cityName } = params;

  const { data: state, error: stateError } = await supabase
    .from("states")
    .select("country_id")
    .eq("id", stateId)
    .single();

  if (stateError || !state) {
    throw new Error("Selected state could not be found.");
  }
  if (state.country_id !== countryId) {
    throw new Error("Selected state does not belong to the selected country.");
  }

  const { data: city, error: cityError } = (await supabase
    .rpc("find_or_create_city", { p_state_id: stateId, p_name: cityName })
    .single()) as { data: { city_id: string } | null; error: { message: string } | null };

  if (cityError || !city) {
    throw new Error(cityError?.message ?? "Could not resolve the city.");
  }

  return city.city_id;
}
