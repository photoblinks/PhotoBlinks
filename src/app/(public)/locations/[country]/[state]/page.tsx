import { cache } from "react";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
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
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { DEFAULT_OG_IMAGE } from "@/lib/jsonld";
import { hasIndexAffectingParams, isSeoEligible } from "@/lib/seo-eligibility";
import { buildGeoDefaultDescription, extractCategoryNames } from "@/lib/seo-templates";

type Props = {
  params: Promise<{ country: string; state: string }>;
  searchParams: Promise<{ q?: string; city?: string; category?: string; pricing?: string; drone?: string }>;
};

const loadStatePage = cache(async (countrySlug: string, stateSlug: string) => {
  const states = await getActiveStates();
  const state = states.find((s) => s.slug === stateSlug && s.country?.slug === countrySlug);
  if (!state) return null;

  const locations = await getPublishedLocations({ stateId: state.id });
  if (locations.length === 0) return null;

  return { state, locations };
});

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { country: countrySlug, state: stateSlug } = await params;
  const query = await searchParams;
  const data = await loadStatePage(countrySlug, stateSlug);
  if (!data) return {};

  const title = data.state.meta_title || `Pre-Wedding Photoshoot Locations in ${data.state.name}`;
  const description =
    data.state.meta_description ||
    buildGeoDefaultDescription(data.state.name, null, extractCategoryNames(data.locations));
  const path = `/locations/${countrySlug}/${data.state.slug}`;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      siteName: "PhotoBlinks",
      type: "website",
      images: [data.state.image_url ?? DEFAULT_OG_IMAGE],
    },
    // Below the SEO eligibility threshold the page still renders for
    // product/UX purposes but shouldn't be indexed — see seo-eligibility.ts.
    // Never affects the state's individual location pages, which are always
    // indexable when published. Filter/search query variants (?city=,
    // ?category=, ?pricing=, ?drone=, ?q=) are noindexed too, since they
    // canonicalize to this same clean URL.
    ...(isSeoEligible(data.locations.length) && !hasIndexAffectingParams(query)
      ? {}
      : { robots: { index: false, follow: true } }),
  };
}

export default async function StateLocationsPage({ params, searchParams }: Props) {
  const { country: countrySlug, state: stateSlug } = await params;
  const data = await loadStatePage(countrySlug, stateSlug);
  if (!data) notFound();

  const { state, locations } = data;
  const query = await searchParams;

  const [allCities, categories] = await Promise.all([getActiveCities(), getActiveCategories()]);
  const cities = allCities.filter((c) => c.state_id === state.id);

  const selectedCity = cities.find((c) => c.slug === query.city);
  const selectedCategory = categories.find((c) => c.slug === query.category);
  const pricingType =
    query.pricing === "free" || query.pricing === "paid" || query.pricing === "unknown"
      ? query.pricing
      : undefined;
  const droneStatus =
    query.drone === "allowed" || query.drone === "allowed_with_permission" || query.drone === "not_allowed"
      ? query.drone
      : undefined;
  const search = query.q?.trim() || undefined;
  const hasFilters = Boolean(selectedCity || selectedCategory || pricingType || droneStatus || search);

  const heading = state.h1_title || `Pre-Wedding Photoshoot Locations in ${state.name}`;

  return (
    <div>
      <section className="relative h-[360px] overflow-hidden sm:h-[420px]">
        {state.image_url ? (
          <Image
            src={state.image_url}
            alt={state.name}
            fill
            priority
            className="object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-linear-to-br from-emerald-950 via-pb-brand to-emerald-800"
          />
        )}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-linear-to-t from-black/60 via-black/10 to-transparent"
        />
        <div className="absolute inset-x-0 bottom-14 px-4 text-center sm:bottom-16 sm:px-6">
          <h1 className="font-heading text-3xl font-semibold text-white sm:text-4xl">{heading}</h1>
        </div>
      </section>

      <div className="relative z-10 mx-auto -mt-8 max-w-7xl px-4 sm:-mt-10 sm:px-6">
        <HomeFilter
          states={[state]}
          cities={cities}
          categories={categories}
          hideState
          basePath={`/locations/${countrySlug}/${state.slug}`}
          initial={{
            q: query.q,
            state: state.slug,
            city: query.city,
            category: query.category,
            pricing: query.pricing,
            drone: query.drone,
          }}
        />
      </div>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <Breadcrumbs
          items={[
            { name: "Home", path: "/" },
            { name: "Locations", path: "/locations" },
            { name: state.country!.name, path: `/locations/${countrySlug}` },
            { name: state.name, path: `/locations/${countrySlug}/${state.slug}` },
          ]}
        />

        {hasFilters ? (
          <FilteredResults
            stateId={state.id}
            cityId={selectedCity?.id}
            categoryId={selectedCategory?.id}
            pricingType={pricingType}
            droneStatus={droneStatus}
            search={search}
          />
        ) : (
          <BrowseState countrySlug={countrySlug} state={state} locations={locations} />
        )}
      </div>
    </div>
  );
}

async function FilteredResults({
  stateId,
  cityId,
  categoryId,
  pricingType,
  droneStatus,
  search,
}: {
  stateId: string;
  cityId?: string;
  categoryId?: string;
  pricingType?: "free" | "paid" | "unknown";
  droneStatus?: "allowed" | "allowed_with_permission" | "not_allowed";
  search?: string;
}) {
  const results = await getPublishedLocations({
    stateId,
    cityId,
    categoryId,
    pricingType,
    droneStatus,
    search,
  });

  return (
    <>
      <h2 className="font-heading mb-6 text-xl font-semibold">
        {results.length} location{results.length === 1 ? "" : "s"} found
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
    </>
  );
}

function BrowseState({
  countrySlug,
  state,
  locations,
}: {
  countrySlug: string;
  state: { id: string; slug: string; name: string };
  locations: PublicLocationCard[];
}) {
  const cityMap = new Map<string, { name: string; slug: string; count: number }>();
  const categoryMap = new Map<string, { name: string; slug: string }>();
  for (const location of locations) {
    if (location.city) {
      const existing = cityMap.get(location.city.slug);
      if (existing) existing.count += 1;
      else cityMap.set(location.city.slug, { ...location.city, count: 1 });
    }
    if (location.category) categoryMap.set(location.category.slug, location.category);
  }
  const cities = [...cityMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  const categories = [...categoryMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  const grouped = groupLocationsByCategory(locations);
  const categoryNames = extractCategoryNames(locations);

  return (
    <>
      <p className="mb-2 max-w-2xl text-muted-foreground">
        {categoryNames.length > 0
          ? `Explore pre-wedding photoshoot locations in ${state.name}, including ${categoryNames
              .map((name) => name.toLowerCase())
              .join(", ")}.`
          : `Explore pre-wedding photoshoot locations in ${state.name}.`}
      </p>

      {cities.length > 0 && (
        <div className="mt-6">
          <h2 className="font-heading mb-3 text-lg font-semibold">Explore Cities in {state.name}</h2>
          <div className="flex flex-wrap gap-2">
            {cities.map((city) => (
              <Link
                key={city.slug}
                href={`/locations/${countrySlug}/${state.slug}/${city.slug}`}
                className="rounded-full border px-3 py-1 text-sm hover:bg-muted"
              >
                {city.name} ({city.count})
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8">
        {categories.map((category) => {
          const items = grouped.get(category.slug) ?? [];
          if (items.length === 0) return null;
          return (
            <section key={category.slug} className="mb-14">
              <Link
                href={`/locations/${countrySlug}/${state.slug}/${category.slug}`}
                className="group inline-block"
              >
                <h2 className="font-heading mb-4 text-2xl font-semibold group-hover:underline">
                  {category.name} locations in {state.name}
                </h2>
              </Link>
              <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
                {items.map((location) => (
                  <LocationCard key={location.id} location={location} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
