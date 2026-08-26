import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Validates that the selected state actually belongs to the selected
 * country, then resolves the typed city name to a city_id — reusing an
 * existing city in that state if one already matches (normalized,
 * case/whitespace-insensitive), or creating it atomically if not (see
 * find_or_create_city). Shared by the location and studio admin forms,
 * which both need the same Country → State → City validation.
 *
 * Redirects with a clear error on any failure — a location/studio is
 * never silently saved with an inconsistent country/state/city
 * relationship.
 */
export async function resolveLocationGeo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: { countryId: string; stateId: string; cityName: string; errorRedirectPath: string },
): Promise<string> {
  const { countryId, stateId, cityName, errorRedirectPath } = params;

  const { data: state, error: stateError } = await supabase
    .from("states")
    .select("country_id")
    .eq("id", stateId)
    .single();

  if (stateError || !state) {
    redirect(`${errorRedirectPath}?error=${encodeURIComponent("Selected state could not be found.")}`);
  }
  if (state.country_id !== countryId) {
    redirect(
      `${errorRedirectPath}?error=${encodeURIComponent("Selected state does not belong to the selected country.")}`,
    );
  }

  const { data: city, error: cityError } = (await supabase
    .rpc("find_or_create_city", { p_state_id: stateId, p_name: cityName })
    .single()) as { data: { city_id: string } | null; error: { message: string } | null };

  if (cityError || !city) {
    redirect(
      `${errorRedirectPath}?error=${encodeURIComponent(cityError?.message ?? "Could not resolve the city.")}`,
    );
  }

  return city.city_id;
}
