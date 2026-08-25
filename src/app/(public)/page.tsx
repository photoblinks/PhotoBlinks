import Link from "next/link";
import type { Metadata } from "next";
import {
  getActiveCategories,
  getActiveCities,
  getActiveStates,
  getPublishedLocations,
  type PublicLocationCard,
} from "@/lib/public-data";
import { HomeFilter } from "@/components/public/home-filter";
import { LocationCard } from "@/components/public/location-card";

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

  const hasFilters = Boolean(selectedState || selectedCity || selectedCategory || pricingType);

  return (
    <div>
      <section className="relative flex min-h-[26rem] flex-col justify-end overflow-hidden bg-linear-to-br from-emerald-950 via-emerald-900 to-emerald-800 px-4 pb-8 sm:px-6 sm:pb-10">
        <div className="mx-auto w-full max-w-6xl">
          <h1 className="max-w-2xl text-4xl font-semibold text-white sm:text-5xl">
            Find Your Perfect Photoshoot Location
          </h1>
          <p className="mt-3 max-w-xl text-emerald-50/90">
            Discover beautiful places for your next shoot across Karnataka and Kerala.
          </p>
          <div className="mt-6">
            <HomeFilter
              states={states}
              cities={cities}
              categories={categories}
              initial={{
                state: params.state,
                city: params.city,
                category: params.category,
                pricing: params.pricing,
              }}
            />
          </div>
        </div>
      </section>

      {hasFilters ? (
        <FilteredResults
          categoryId={selectedCategory?.id}
          stateId={selectedState?.id}
          cityId={selectedCity?.id}
          pricingType={pricingType}
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
}: {
  categoryId?: string;
  stateId?: string;
  cityId?: string;
  pricingType?: "free" | "paid" | "unknown";
}) {
  const results = await getPublishedLocations({ categoryId, stateId, cityId, pricingType });

  return (
    <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h2 className="mb-6 text-xl font-semibold">
        {results.length} location{results.length === 1 ? "" : "s"} found
      </h2>
      {results.length === 0 ? (
        <p className="text-muted-foreground">
          No published locations match these filters yet. Try a different combination.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
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
  const allPublished = await getPublishedLocations();
  const grouped = groupByCategory(allPublished);
  const paidLocations = allPublished.filter((l) => l.pricing_type === "paid").slice(0, PREVIEW_COUNT);

  const sectionsWithLocations = categories.filter((c) => (grouped.get(c.slug)?.length ?? 0) > 0);

  if (sectionsWithLocations.length === 0 && paidLocations.length === 0) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
        <p className="text-muted-foreground">
          No photoshoot locations are published yet — check back soon.
        </p>
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      {sectionsWithLocations.map((category) => {
        const locations = grouped.get(category.slug)!;
        return (
          <section key={category.id} className="mb-12">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-xl font-semibold">{category.name}</h2>
              <Link
                href={`/?category=${category.slug}`}
                className="text-sm font-medium text-primary hover:underline"
              >
                View All →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {locations.slice(0, PREVIEW_COUNT).map((location) => (
                <LocationCard key={location.id} location={location} />
              ))}
            </div>
          </section>
        );
      })}

      {paidLocations.length > 0 && (
        <section className="mb-12">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-xl font-semibold">Paid Locations</h2>
            <Link
              href="/?pricing=paid"
              className="text-sm font-medium text-primary hover:underline"
            >
              View All →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {paidLocations.map((location) => (
              <LocationCard key={location.id} location={location} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
