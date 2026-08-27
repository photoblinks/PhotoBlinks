import Link from "next/link";
import type { Metadata } from "next";
import {
  getActiveCategories,
  getActiveCities,
  getActiveStates,
  getPublishedLocations,
  getPublishedStudios,
  getSiteSettings,
  groupLocationsByCategory,
} from "@/lib/public-data";
import { HomeFilter } from "@/components/public/home-filter";
import { HeroBannerSlider } from "@/components/public/hero-banner-slider";
import { LocationCard } from "@/components/public/location-card";
import { StudioCard } from "@/components/public/studio-card";
import { JsonLd } from "@/components/public/json-ld";
import { DEFAULT_OG_IMAGE, buildOrganizationJsonLd, buildWebSiteJsonLd } from "@/lib/jsonld";

export const metadata: Metadata = {
  title: "Pre-Wedding Photoshoot Locations in India",
  description:
    "Discover pre-wedding photoshoot locations across Karnataka and Kerala — beaches, waterfalls, temples, hills, and more. Browse by state, city, or category.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "PhotoBlinks — Pre-Wedding Photoshoot Locations in India",
    description:
      "Discover pre-wedding photoshoot locations across Karnataka and Kerala — beaches, waterfalls, temples, hills, and more.",
    url: "/",
    siteName: "PhotoBlinks",
    type: "website",
    images: [DEFAULT_OG_IMAGE],
  },
};

const PREVIEW_COUNT = 4;

export default async function HomePage({
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
  const [states, cities, categories, siteSettings] = await Promise.all([
    getActiveStates(),
    getActiveCities(),
    getActiveCategories(),
    getSiteSettings(),
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

  const hasFilters = Boolean(selectedState || selectedCity || selectedCategory || pricingType || near);

  return (
    <div>
      <section className="relative h-[520px] overflow-hidden sm:h-[620px] lg:h-[720px]">
        {siteSettings.bannerImages.length > 0 ? (
          <HeroBannerSlider images={siteSettings.bannerImages} />
        ) : (
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-linear-to-br from-emerald-950 via-pb-brand to-emerald-800"
          />
        )}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-40 bg-linear-to-t from-black/50 to-transparent"
        />
        <div className="absolute inset-x-0 bottom-16 px-4 text-center sm:bottom-20 sm:px-6">
          <h1 className="font-heading text-3xl font-semibold text-white sm:text-4xl">
            Discover Stunning Pre-Wedding Photoshoot Locations in India
          </h1>
        </div>
      </section>

      <div className="relative z-10 mx-auto -mt-8 max-w-6xl px-4 sm:-mt-10 sm:px-6">
        <HomeFilter
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
      </div>

      {hasFilters ? (
        <FilteredResults
          categoryId={selectedCategory?.id}
          stateId={selectedState?.id}
          cityId={selectedCity?.id}
          pricingType={pricingType}
          near={near}
        />
      ) : (
        <BrowseByCategory categories={categories} />
      )}

      <JsonLd data={buildWebSiteJsonLd()} />
      <JsonLd data={buildOrganizationJsonLd()} />
    </div>
  );
}

async function FilteredResults({
  categoryId,
  stateId,
  cityId,
  pricingType,
  near,
}: {
  categoryId?: string;
  stateId?: string;
  cityId?: string;
  pricingType?: "free" | "paid" | "unknown";
  near?: { latitude: number; longitude: number };
}) {
  const results = await getPublishedLocations({ categoryId, stateId, cityId, pricingType, near });

  return (
    <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h2 className="font-heading mb-6 text-xl font-semibold">
        {results.length} location{results.length === 1 ? "" : "s"} found
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
    </section>
  );
}

async function BrowseByCategory({
  categories,
}: {
  categories: { id: string; name: string; slug: string; sort_order: number }[];
}) {
  const [allPublished, studios] = await Promise.all([
    getPublishedLocations(),
    getPublishedStudios(),
  ]);
  const grouped = groupLocationsByCategory(allPublished);
  const featuredStudios = studios.slice(0, PREVIEW_COUNT);

  const sectionsWithLocations = categories.filter((c) => (grouped.get(c.slug)?.length ?? 0) > 0);

  if (sectionsWithLocations.length === 0 && featuredStudios.length === 0) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
        <p className="text-muted-foreground">
          No photoshoot locations are published yet — check back soon.
        </p>
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      {sectionsWithLocations.length > 0 && (
        <p className="mb-1 text-xs font-semibold tracking-[0.2em] text-pb-brand-bright uppercase">
          Popular Destinations
        </p>
      )}

      {sectionsWithLocations.map((category) => {
        const locations = grouped.get(category.slug)!;
        return (
          <section key={category.id} className="mb-14">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="font-heading text-2xl font-semibold">{category.name}</h2>
              <Link
                href={`/category/${category.slug}`}
                className="text-sm font-medium text-pb-brand hover:underline"
              >
                All {category.name} locations →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
              {locations.slice(0, PREVIEW_COUNT).map((location) => (
                <LocationCard key={location.id} location={location} />
              ))}
            </div>
          </section>
        );
      })}

      {featuredStudios.length > 0 && (
        <section className="mb-4">
          <p className="mb-1 text-xs font-semibold tracking-[0.2em] text-pb-brand-bright uppercase">
            Hourly Billed
          </p>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-heading text-2xl font-semibold">Studios</h2>
            <Link href="/studios" className="text-sm font-medium text-pb-brand hover:underline">
              View All →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
            {featuredStudios.map((studio) => (
              <StudioCard key={studio.id} studio={studio} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
