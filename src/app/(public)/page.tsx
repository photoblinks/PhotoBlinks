import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import {
  getActiveCategories,
  getActiveCities,
  getActiveStates,
  getFeaturedLocationImageUrl,
  getPublishedLocationCount,
  getPublishedLocations,
  getPublishedStudios,
  getSiteSettings,
  groupLocationsByCategory,
} from "@/lib/public-data";
import { HomeFilter } from "@/components/public/home-filter";
import { HeroBannerSlider } from "@/components/public/hero-banner-slider";
import { LocationCard } from "@/components/public/location-card";
import { StudioCard } from "@/components/public/studio-card";
import { AboutSection } from "@/components/public/about-section";
import { JsonLd } from "@/components/public/json-ld";
import { DEFAULT_OG_IMAGE, buildOrganizationJsonLd, buildWebSiteJsonLd } from "@/lib/jsonld";
import { hasIndexAffectingParams } from "@/lib/seo-eligibility";

type HomeSearchParams = Promise<{
  q?: string;
  state?: string;
  city?: string;
  category?: string;
  pricing?: string;
  drone?: string;
  lat?: string;
  lng?: string;
}>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: HomeSearchParams;
}): Promise<Metadata> {
  const query = await searchParams;

  return {
    title: "Pre-Wedding Photoshoot Locations in India",
    description:
      "Discover pre-wedding photoshoot locations across India — beaches, waterfalls, temples, hills, and more. Browse by state, city, or category.",
    alternates: { canonical: "/" },
    openGraph: {
      title: "PhotoBlinks — Pre-Wedding Photoshoot Locations in India",
      description:
        "Discover pre-wedding photoshoot locations across India — beaches, waterfalls, temples, hills, and more.",
      url: "/",
      siteName: "PhotoBlinks",
      type: "website",
      images: [DEFAULT_OG_IMAGE],
    },
    // Filter/search query variants (?state=, ?city=, ?category=, ?pricing=,
    // ?drone=, ?q=, ?lat=/?lng=) are noindexed since they canonicalize to
    // this same clean "/" URL and aren't meant to be standalone landing
    // pages — see seo-eligibility.ts.
    ...(hasIndexAffectingParams(query) ? { robots: { index: false, follow: true } } : {}),
  };
}

const PREVIEW_COUNT = 4;

export default async function HomePage({
  searchParams,
}: {
  searchParams: HomeSearchParams;
}) {
  const params = await searchParams;
  const [states, cities, categories, siteSettings, locationCount, featuredImageUrl] =
    await Promise.all([
      getActiveStates(),
      getActiveCities(),
      getActiveCategories(),
      getSiteSettings(),
      getPublishedLocationCount(),
      getFeaturedLocationImageUrl(),
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
  const hasFilters = Boolean(
    selectedState || selectedCity || selectedCategory || pricingType || droneStatus || near || search,
  );

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

      <div className="relative z-10 mx-auto -mt-8 max-w-7xl px-4 sm:-mt-10 sm:px-6">
        <HomeFilter
          states={states}
          cities={cities}
          categories={categories}
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

      {/* The hero and filter form above don't depend on the results below,
          so a Suspense boundary here lets Next.js flush that shell to the
          client immediately and stream this section in once its (cached)
          data query resolves, instead of blocking the whole response on it.
          `searchParams` is still read above to build the filter's `initial`
          values, which keeps the route itself dynamic regardless — see the
          F6 report for why that's unavoidable without enabling Next.js's
          experimental Partial Prerendering. */}
      <Suspense fallback={<ResultsSkeleton />}>
        {hasFilters ? (
          <FilteredResults
            categoryId={selectedCategory?.id}
            stateId={selectedState?.id}
            cityId={selectedCity?.id}
            pricingType={pricingType}
            droneStatus={droneStatus}
            near={near}
            search={search}
          />
        ) : (
          <BrowseByCategory categories={categories} />
        )}
      </Suspense>

      <AboutSection
        locationCount={locationCount}
        categoryNames={categories.map((c) => c.name)}
        imageUrl={siteSettings.bannerImages[0] ?? featuredImageUrl}
      />

      <JsonLd data={buildWebSiteJsonLd()} />
      <JsonLd data={buildOrganizationJsonLd()} />
    </div>
  );
}

/** Matches the FilteredResults/BrowseByCategory grid's column count and
 * card aspect ratio so streaming this section in doesn't shift layout. */
function ResultsSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6" aria-hidden="true">
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: PREVIEW_COUNT }).map((_, index) => (
          <div key={index} className="aspect-square animate-pulse rounded-2xl bg-muted sm:aspect-4/3" />
        ))}
      </div>
    </div>
  );
}

async function FilteredResults({
  categoryId,
  stateId,
  cityId,
  pricingType,
  droneStatus,
  near,
  search,
}: {
  categoryId?: string;
  stateId?: string;
  cityId?: string;
  pricingType?: "free" | "paid" | "unknown";
  droneStatus?: "allowed" | "allowed_with_permission" | "not_allowed";
  near?: { latitude: number; longitude: number };
  search?: string;
}) {
  const results = await getPublishedLocations({
    categoryId,
    stateId,
    cityId,
    pricingType,
    droneStatus,
    near,
    search,
  });

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
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
      <section className="mx-auto max-w-7xl px-4 py-16 text-center sm:px-6">
        <p className="text-muted-foreground">
          No photoshoot locations are published yet — check back soon.
        </p>
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
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
                All {category.name} →
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
