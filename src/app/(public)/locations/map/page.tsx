import type { Metadata } from "next";
import {
  getActiveCategories,
  getActiveCities,
  getActiveStates,
  getPublishedLocations,
} from "@/lib/public-data";
import { HomeFilter } from "@/components/public/home-filter";
import { LocationsMap } from "@/components/public/locations-map";

export const metadata: Metadata = {
  title: "Map",
  description: "Browse published PhotoBlinks photoshoot locations on the map.",
  alternates: { canonical: "/locations/map" },
};

export default async function LocationsMapPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; city?: string; category?: string; pricing?: string }>;
}) {
  const params = await searchParams;
  const [states, cities, categories] = await Promise.all([
    getActiveStates(),
    getActiveCities(),
    getActiveCategories(),
  ]);

  const selectedState = states.find((s) => s.slug === params.state);
  const selectedCity = cities.find((c) => c.slug === params.city);
  const selectedCategory = categories.find((c) => c.slug === params.category);
  const pricingType =
    params.pricing === "free" || params.pricing === "paid" || params.pricing === "unknown"
      ? params.pricing
      : undefined;

  const locations = await getPublishedLocations({
    categoryId: selectedCategory?.id,
    stateId: selectedState?.id,
    cityId: selectedCity?.id,
    pricingType,
  });

  const mappableCount = locations.filter((l) => l.latitude != null && l.longitude != null).length;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold">Locations Map</h1>
        <p className="text-sm text-muted-foreground">
          {mappableCount} location{mappableCount === 1 ? "" : "s"} on the map
        </p>
      </div>

      <HomeFilter
        states={states}
        cities={cities}
        categories={categories}
        basePath="/locations/map"
        initial={{
          state: params.state,
          city: params.city,
          category: params.category,
          pricing: params.pricing,
        }}
      />

      <div className="h-[70vh] min-h-[420px] overflow-hidden rounded-xl border">
        {mappableCount === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-muted-foreground">
            No published locations match these filters yet.
          </div>
        ) : (
          <LocationsMap locations={locations} />
        )}
      </div>
    </div>
  );
}
