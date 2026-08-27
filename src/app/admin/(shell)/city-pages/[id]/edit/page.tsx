import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GeoPageForm } from "@/components/admin/geo-page-form";
import { updateCityPage } from "../../actions";

export default async function EditCityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const { data: city } = await supabase
    .from("cities")
    .select("*, states(slug, countries(slug))")
    .eq("id", id)
    .single();

  if (!city) notFound();

  const state = Array.isArray(city.states) ? city.states[0] : city.states;
  const stateSlug = (state as { slug: string; countries: unknown } | null)?.slug ?? "";
  const countryRaw = (state as { countries: unknown } | null)?.countries;
  const country = Array.isArray(countryRaw) ? countryRaw[0] : countryRaw;
  const countrySlug = (country as { slug: string } | null)?.slug ?? "";

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Edit City Page — {city.name}</h1>
      <GeoPageForm
        action={updateCityPage.bind(null, id)}
        record={city}
        imageKind="cities"
        imageSlug={city.slug}
        pageUrl={`/locations/${countrySlug}/${stateSlug}/${city.slug}`}
        defaultH1={`Photoshoot Locations in ${city.name}`}
        error={error}
      />
    </div>
  );
}
