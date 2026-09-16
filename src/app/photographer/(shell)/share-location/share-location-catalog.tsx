import {
  getActiveCategories,
  getActiveCities,
  getActiveStates,
  getPublishedLocations,
  groupLocationsByCategory,
  type PublicLocationCard,
} from "@/lib/public-data";
import { HomeFilter } from "@/components/public/home-filter";
import { LocationCard } from "@/components/public/location-card";
import { FavouritesProvider } from "@/components/public/favourites-provider";
import { ShareCardActions, ShareSelectionBar } from "./share-location-client";

export type CatalogSearchParams = Promise<{
  q?: string;
  state?: string;
  city?: string;
  category?: string;
  pricing?: string;
  drone?: string;
  lat?: string;
  lng?: string;
}>;

/** Location picker for a share: the homepage's published-location catalog
 * (same HomeFilter, same filter semantics, same getPublishedLocations query
 * and LocationCard) with [Add to List] [Open] actions under each card. */
export async function ShareLocationCatalog({
  searchParams,
  basePath,
}: {
  searchParams: CatalogSearchParams;
  basePath: string;
}) {
  const params = await searchParams;
  const [states, cities, categories] = await Promise.all([
    getActiveStates(),
    getActiveCities(),
    getActiveCategories(),
  ]);

  // Same parsing as the homepage (src/app/(public)/page.tsx).
  const selectedState = states.find((s) => s.slug === params.state);
  const selectedCity = cities.find((c) => c.slug === params.city);
  const selectedCategory = categories.find((c) => c.slug === params.category);
  const pricingType =
    params.pricing === "free" || params.pricing === "paid" || params.pricing === "unknown"
      ? params.pricing
      : undefined;
  const droneStatus =
    params.drone === "allowed" || params.drone === "allowed_with_permission" || params.drone === "not_allowed"
      ? params.drone
      : undefined;
  const near =
    params.lat && params.lng ? { latitude: Number(params.lat), longitude: Number(params.lng) } : undefined;
  const search = params.q?.trim() || undefined;
  const hasFilters = Boolean(
    selectedState || selectedCity || selectedCategory || pricingType || droneStatus || near || search,
  );

  const locations = await getPublishedLocations(
    hasFilters
      ? {
          categoryId: selectedCategory?.id,
          stateId: selectedState?.id,
          cityId: selectedCity?.id,
          pricingType,
          droneStatus,
          near,
          search,
        }
      : undefined,
  );

  const renderGrid = (items: PublicLocationCard[]) => (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((location) => (
        <LocationCard
          key={location.id}
          location={location}
          actions={
            <ShareCardActions
              id={location.id}
              name={location.cardName || location.name}
              slug={location.slug}
            />
          }
        />
      ))}
    </div>
  );

  const grouped = hasFilters ? null : groupLocationsByCategory(locations);

  return (
    <FavouritesProvider>
      <div className="pb-theme bg-pb-cream">
        <ShareSelectionBar />
        <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
          <HomeFilter
            states={states}
            cities={cities}
            categories={categories}
            basePath={basePath}
            initial={params}
          />
        </div>

        {grouped ? (
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
            {categories
              .filter((c) => (grouped.get(c.slug)?.length ?? 0) > 0)
              .map((category) => (
                <section key={category.id} className="mb-14">
                  <h2 className="font-heading mb-4 text-2xl font-semibold">{category.name}</h2>
                  {renderGrid(grouped.get(category.slug)!)}
                </section>
              ))}
            {locations.length === 0 && (
              <p className="text-muted-foreground">No photoshoot locations are published yet.</p>
            )}
          </div>
        ) : (
          <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
            <h2 className="font-heading mb-6 text-xl font-semibold">
              {locations.length} location{locations.length === 1 ? "" : "s"} found
              {near && " · sorted by distance"}
            </h2>
            {locations.length === 0 ? (
              <p className="text-muted-foreground">
                No published locations match these filters yet. Try a different combination.
              </p>
            ) : (
              renderGrid(locations)
            )}
          </section>
        )}
      </div>
    </FavouritesProvider>
  );
}
