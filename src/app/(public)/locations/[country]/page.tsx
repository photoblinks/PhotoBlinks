import { cache } from "react";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getActiveCategories,
  getActiveCities,
  getActiveCountries,
  getActiveStates,
  getPublishedLocations,
  type PublicLocationCard,
} from "@/lib/public-data";
import { HomeFilter } from "@/components/public/home-filter";
import { LocationCard } from "@/components/public/location-card";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { DEFAULT_OG_IMAGE } from "@/lib/jsonld";

type Props = {
  params: Promise<{ country: string }>;
  searchParams: Promise<{ state?: string; city?: string; category?: string; pricing?: string }>;
};

const loadCountryPage = cache(async (countrySlug: string) => {
  const countries = await getActiveCountries();
  const country = countries.find((c) => c.slug === countrySlug);
  if (!country) return null;

  const locations = await getPublishedLocations({ countryId: country.id });
  if (locations.length === 0) return null;

  return { country, locations };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { country: countrySlug } = await params;
  const data = await loadCountryPage(countrySlug);
  if (!data) return {};

  const title = data.country.meta_title || `Pre-Wedding Photoshoot Locations in ${data.country.name}`;
  const description =
    data.country.meta_description ||
    `Explore pre-wedding photoshoot locations in ${data.country.name} by state.`;

  return {
    title,
    description,
    alternates: { canonical: `/locations/${data.country.slug}` },
    openGraph: {
      title,
      description,
      url: `/locations/${data.country.slug}`,
      siteName: "PhotoBlinks",
      type: "website",
      images: [data.country.image_url ?? DEFAULT_OG_IMAGE],
    },
  };
}

export default async function CountryLocationsPage({ params, searchParams }: Props) {
  const { country: countrySlug } = await params;
  const data = await loadCountryPage(countrySlug);
  if (!data) notFound();

  const { country, locations } = data;
  const query = await searchParams;

  const [allStates, allCities, categories] = await Promise.all([
    getActiveStates(),
    getActiveCities(),
    getActiveCategories(),
  ]);
  const states = allStates.filter((s) => s.country_id === country.id);
  const cities = allCities.filter((c) => states.some((s) => s.id === c.state_id));

  const selectedState = states.find((s) => s.slug === query.state);
  const selectedCity = cities.find((c) => c.slug === query.city);
  const selectedCategory = categories.find((c) => c.slug === query.category);
  const pricingType =
    query.pricing === "free" || query.pricing === "paid" || query.pricing === "unknown"
      ? query.pricing
      : undefined;
  const hasFilters = Boolean(selectedState || selectedCity || selectedCategory || pricingType);

  const heading = country.h1_title || `Pre-Wedding Photoshoot Locations in ${country.name}`;

  return (
    <div>
      <section className="relative h-[360px] overflow-hidden sm:h-[420px]">
        {country.image_url ? (
          <Image
            src={country.image_url}
            alt={country.name}
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

      <div className="relative z-10 mx-auto -mt-8 max-w-6xl px-4 sm:-mt-10 sm:px-6">
        <HomeFilter
          states={states}
          cities={cities}
          categories={categories}
          basePath={`/locations/${country.slug}`}
          initial={{
            state: query.state,
            city: query.city,
            category: query.category,
            pricing: query.pricing,
          }}
        />
      </div>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <Breadcrumbs
          items={[
            { name: "Home", path: "/" },
            { name: "Locations", path: "/locations" },
            { name: country.name, path: `/locations/${country.slug}` },
          ]}
        />

        {hasFilters ? (
          <FilteredResults
            countryId={country.id}
            stateId={selectedState?.id}
            cityId={selectedCity?.id}
            categoryId={selectedCategory?.id}
            pricingType={pricingType}
          />
        ) : (
          <BrowseByState country={country} locations={locations} />
        )}
      </div>
    </div>
  );
}

async function FilteredResults({
  countryId,
  stateId,
  cityId,
  categoryId,
  pricingType,
}: {
  countryId: string;
  stateId?: string;
  cityId?: string;
  categoryId?: string;
  pricingType?: "free" | "paid" | "unknown";
}) {
  const results = await getPublishedLocations({ countryId, stateId, cityId, categoryId, pricingType });

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

function BrowseByState({
  country,
  locations,
}: {
  country: { id: string; slug: string; name: string };
  locations: PublicLocationCard[];
}) {
  const stateCounts = new Map<string, { name: string; slug: string; count: number }>();
  for (const location of locations) {
    if (!location.state) continue;
    const existing = stateCounts.get(location.state.slug);
    if (existing) existing.count += 1;
    else stateCounts.set(location.state.slug, { ...location.state, count: 1 });
  }
  const states = [...stateCounts.values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <p className="mb-2 max-w-2xl text-muted-foreground">
        Explore pre-wedding photoshoot locations in {country.name} by state — beaches, waterfalls,
        temples, hills, and more.
      </p>
      <h2 className="font-heading mb-3 text-lg font-semibold">Explore Locations by State</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {states.map((state) => (
          <Link
            key={state.slug}
            href={`/locations/${country.slug}/${state.slug}`}
            className="rounded-lg border p-4 transition-shadow hover:shadow-md"
          >
            <h2 className="text-lg font-semibold">{state.name}</h2>
            <p className="text-sm text-muted-foreground">
              {state.count} location{state.count === 1 ? "" : "s"}
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}
