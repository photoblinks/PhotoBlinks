import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import {
  getActiveCategories,
  getActiveCities,
  getActiveStates,
  getPublishedLocations,
  getPublishedStudios,
  getSiteSettings,
  type PublicLocationCard,
} from "@/lib/public-data";
import { HomeFilter } from "@/components/public/home-filter";
import { LocationCard } from "@/components/public/location-card";
import { StudioCard } from "@/components/public/studio-card";

export const metadata: Metadata = {
  title: "Find Your Perfect Photoshoot Location",
  description:
    "Discover beautiful photoshoot locations across Karnataka and Kerala — beaches, waterfalls, temples, hills, and more.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "PhotoBlinks — Find Your Perfect Photoshoot Location",
    description: "Discover beautiful photoshoot locations across Karnataka and Kerala.",
    url: "/",
    siteName: "PhotoBlinks",
    type: "website",
  },
};

const PREVIEW_COUNT = 4;

function groupByCategory(locations: PublicLocationCard[]) {
  const grouped = new Map<string, PublicLocationCard[]>();
  for (const location of locations) {
    const slug = location.category?.slug;
    if (!slug) continue;
    if (!grouped.has(slug)) grouped.set(slug, []);
    grouped.get(slug)!.push(location);
  }
  return grouped;
}

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
        {siteSettings.heroImageUrl ? (
          <Image
            src={siteSettings.heroImageUrl}
            alt=""
            fill
            priority
            className="object-cover"
            unoptimized
          />
        ) : (
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-linear-to-br from-emerald-950 via-pb-brand to-emerald-800"
          />
        )}
      </section>

      <div className="mx-auto max-w-6xl px-4 pt-8 pb-12 text-center sm:px-6 sm:pt-10 sm:pb-16">
        <h1 className="font-heading text-3xl font-semibold sm:text-4xl">
          Discover the Best Photoshoot Locations in India
        </h1>
      </div>

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
  const grouped = groupByCategory(allPublished);
  const paidLocations = allPublished.filter((l) => l.pricing_type === "paid").slice(0, PREVIEW_COUNT);
  const featuredStudios = studios.slice(0, PREVIEW_COUNT);

  const sectionsWithLocations = categories.filter((c) => (grouped.get(c.slug)?.length ?? 0) > 0);

  if (sectionsWithLocations.length === 0 && paidLocations.length === 0 && featuredStudios.length === 0) {
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
                href={`/?category=${category.slug}`}
                className="text-sm font-medium text-pb-brand hover:underline"
              >
                View All →
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

      {paidLocations.length > 0 && (
        <section className="mb-14">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-heading text-2xl font-semibold">Paid Locations</h2>
            <Link
              href="/?pricing=paid"
              className="text-sm font-medium text-pb-brand hover:underline"
            >
              View All →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
            {paidLocations.map((location) => (
              <LocationCard key={location.id} location={location} />
            ))}
          </div>
        </section>
      )}

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
