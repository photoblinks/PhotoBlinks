import type { Metadata } from "next";
import Link from "next/link";
import { LayoutGrid, List } from "lucide-react";
import {
  getActiveCategories,
  getActiveCities,
  getActiveStates,
  getPublishedLocations,
} from "@/lib/public-data";
import { HomeFilter } from "@/components/public/home-filter";
import { LocationsMap } from "@/components/public/locations-map";
import { MapFiltersDrawer } from "@/components/public/map-filters-drawer";
import { getCategoryMarkerStyle } from "@/lib/category-style";
import { DEFAULT_OG_IMAGE } from "@/lib/jsonld";

const TITLE = "Pre-Wedding Photoshoot Locations Map";
const DESCRIPTION =
  "Browse pre-wedding photoshoot locations on an interactive map — filter by state, city, category, and pricing to find your next shoot location.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/locations/map" },
  openGraph: {
    title: `${TITLE} | PhotoBlinks`,
    description: DESCRIPTION,
    url: "/locations/map",
    siteName: "PhotoBlinks",
    type: "website",
    images: [DEFAULT_OG_IMAGE],
  },
};

export default async function LocationsMapPage({
  searchParams,
}: {
  searchParams: Promise<{
    state?: string;
    city?: string;
    category?: string;
    pricing?: string;
    lat?: string;
    lng?: string;
  }>;
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
  const near =
    params.lat && params.lng
      ? { latitude: Number(params.lat), longitude: Number(params.lng) }
      : undefined;

  const locations = await getPublishedLocations({
    categoryId: selectedCategory?.id,
    stateId: selectedState?.id,
    cityId: selectedCity?.id,
    pricingType,
    near,
  });

  const mappableCount = locations.filter((l) => l.latitude != null && l.longitude != null).length;

  function pillHref(categorySlug?: string) {
    const query = new URLSearchParams();
    if (params.state) query.set("state", params.state);
    if (params.city) query.set("city", params.city);
    if (categorySlug) query.set("category", categorySlug);
    if (params.pricing) query.set("pricing", params.pricing);
    if (params.lat) query.set("lat", params.lat);
    if (params.lng) query.set("lng", params.lng);
    const qs = query.toString();
    return qs ? `/locations/map?${qs}` : "/locations/map";
  }

  // /locations is a state-directory page with no filter support at all, so
  // the list-view equivalent of the current map filters is the homepage's
  // own filtered results view, which reads these same six params.
  function listViewHref() {
    const query = new URLSearchParams();
    if (params.state) query.set("state", params.state);
    if (params.city) query.set("city", params.city);
    if (params.category) query.set("category", params.category);
    if (params.pricing) query.set("pricing", params.pricing);
    if (params.lat) query.set("lat", params.lat);
    if (params.lng) query.set("lng", params.lng);
    const qs = query.toString();
    return qs ? `/?${qs}` : "/";
  }

  const pillClass = (active: boolean) =>
    `flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
      active ? "bg-pb-brand text-white" : "text-foreground/70 hover:bg-muted"
    }`;

  return (
    <div>
      <h1 className="sr-only">Pre-Wedding Photoshoot Locations Map</h1>

      <div className="mx-auto hidden max-w-6xl px-4 py-4 sm:block sm:px-6">
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
            lat: params.lat,
            lng: params.lng,
          }}
        />
      </div>

      <div className="relative h-[calc(100vh-4rem)] w-full sm:h-[78vh] sm:min-h-[520px]">
        {mappableCount === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-muted-foreground">
            No published locations match these filters yet.
          </div>
        ) : (
          <LocationsMap locations={locations} />
        )}

        <MapFiltersDrawer
          states={states}
          cities={cities}
          categories={categories}
          initial={{
            state: params.state,
            city: params.city,
            category: params.category,
            pricing: params.pricing,
            lat: params.lat,
            lng: params.lng,
          }}
        />

        <Link
          href={listViewHref()}
          className="absolute top-4 left-4 z-10 hidden items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold shadow-md hover:bg-muted sm:flex"
        >
          <List className="size-4" />
          List View
        </Link>

        {mappableCount > 0 && (
          <div className="absolute inset-x-0 bottom-4 z-10 flex justify-center px-4">
            <div className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-white p-1.5 shadow-md">
              <Link href={pillHref(undefined)} className={pillClass(!params.category)}>
                <LayoutGrid className="size-4" />
                All
              </Link>
              {categories.map((category) => {
                const { icon: Icon } = getCategoryMarkerStyle(category.slug);
                return (
                  <Link
                    key={category.id}
                    href={pillHref(category.slug)}
                    className={pillClass(params.category === category.slug)}
                  >
                    <Icon className="size-4" />
                    {category.name}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
