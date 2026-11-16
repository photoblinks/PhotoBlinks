import type { Metadata } from "next";
import {
  getActiveCategories,
  getFilterCities,
  getFilterStates,
  getPublishedLocations,
} from "@/lib/public-data";
import { HomeFilter } from "@/components/public/home-filter";
import { LocationCard } from "@/components/public/location-card";
import { ListingPagination } from "@/components/public/listing-pagination";
import { paginateListing } from "@/lib/listing-pagination";

const BASE_PATH = "/locations/search";

type SearchParams = Promise<{
  q?: string;
  state?: string;
  city?: string;
  category?: string;
  pricing?: string;
  drone?: string;
  lat?: string;
  lng?: string;
  page?: string;
}>;

// Filtered/search results view (moved off "/" so the homepage can be static).
// Reads searchParams, so it is dynamic by design; never indexed.
export const metadata: Metadata = {
  title: "Search Pre-Wedding Photoshoot Locations",
  alternates: { canonical: "/" },
  robots: { index: false, follow: true },
};

export default async function LocationSearchPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const [states, cities, categories] = await Promise.all([
    getFilterStates(),
    getFilterCities(),
    getActiveCategories(),
  ]);

  const selectedState = states.find((s) => s.slug === params.state);
  const selectedCity = cities.find((c) => c.slug === params.city);
  const selectedCategory = categories.find((c) => c.slug === params.category);
  const pricingType =
    params.pricing === "free" || params.pricing === "paid" || params.pricing === "unknown"
      ? params.pricing
      : undefined;
  const droneStatus =
    params.drone === "allowed" ||
    params.drone === "allowed_with_permission" ||
    params.drone === "not_allowed"
      ? params.drone
      : undefined;
  const near =
    params.lat && params.lng
      ? { latitude: Number(params.lat), longitude: Number(params.lng) }
      : undefined;
  const search = params.q?.trim() || undefined;

  const all = await getPublishedLocations({
    categoryId: selectedCategory?.id,
    stateId: selectedState?.id,
    cityId: selectedCity?.id,
    pricingType,
    droneStatus,
    near,
    search,
  });
  const { items: results, page, totalPages, total } = paginateListing(all, params.page);

  return (
    <div>
      <h1 className="sr-only">Search Pre-Wedding Photoshoot Locations</h1>
      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
        <HomeFilter
          states={states}
          cities={cities}
          categories={categories}
          basePath={BASE_PATH}
          initial={{
            q: params.q,
            state: params.state,
            city: params.city,
            category: params.category,
            pricing: params.pricing,
            drone: params.drone,
            lat: params.lat,
            lng: params.lng,
          }}
        />
      </div>
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <h2 className="font-heading mb-6 text-xl font-semibold">
          {total} location{total === 1 ? "" : "s"} found
          {near && " · sorted by distance"}
        </h2>
        {results.length === 0 ? (
          <p className="text-muted-foreground">
            No published locations match these filters yet. Try a different combination.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
            {results.map((location) => (
              <LocationCard key={location.id} location={location} />
            ))}
          </div>
        )}
        <ListingPagination page={page} totalPages={totalPages} basePath={BASE_PATH} query={params} />
      </section>
    </div>
  );
}
