import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import Image from "next/image";
import {
  getActiveCities,
  getActiveStates,
  getCategoryBySlug,
  getPublishedLocations,
  type PublicLocationCard,
} from "@/lib/public-data";
import { HomeFilter } from "@/components/public/home-filter";
import { LocationCard } from "@/components/public/location-card";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { JsonLd } from "@/components/public/json-ld";
import { DEFAULT_OG_IMAGE, buildItemListJsonLd } from "@/lib/jsonld";
import { hasIndexAffectingParams, isSeoEligible } from "@/lib/seo-eligibility";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; state?: string; city?: string; pricing?: string; drone?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const query = await searchParams;
  const category = await getCategoryBySlug(slug);
  if (!category) return {};

  // Eligibility must reflect the canonical (nationwide, unfiltered) dataset
  // regardless of any ?state=/?city=/?pricing= query — same rule City +
  // Category and State + Category already use.
  const locations = await getPublishedLocations({ categoryId: category.id });

  const title = category.meta_title || `${category.name} Pre-Wedding Photoshoot Locations in India`;
  const description =
    category.meta_description ||
    category.description ||
    `Browse ${category.name.toLowerCase()} pre-wedding photoshoot locations across India and filter by state, city, and budget.`;
  const path = `/category/${category.slug}`;

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
      images: [category.image_url ?? DEFAULT_OG_IMAGE],
    },
    // Below the SEO eligibility threshold the page still renders for
    // product/UX purposes but shouldn't be indexed — see seo-eligibility.ts.
    // Filter/search query variants (?state=, ?city=, ?pricing=, ?drone=,
    // ?q=) are noindexed too, since they canonicalize to this same clean URL.
    ...(isSeoEligible(locations.length) && !hasIndexAffectingParams(query)
      ? {}
      : { robots: { index: false, follow: true } }),
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const query = await searchParams;
  const [states, cities] = await Promise.all([getActiveStates(), getActiveCities()]);

  const selectedState = states.find((s) => s.slug === query.state);
  const selectedCity = cities.find((c) => c.slug === query.city);
  const pricingType =
    query.pricing === "free" || query.pricing === "paid" || query.pricing === "unknown"
      ? query.pricing
      : undefined;
  const droneStatus =
    query.drone === "allowed" || query.drone === "allowed_with_permission" || query.drone === "not_allowed"
      ? query.drone
      : undefined;
  const search = query.q?.trim() || undefined;
  const hasFilters = Boolean(selectedState || selectedCity || pricingType || droneStatus || search);

  const locations = await getPublishedLocations({
    categoryId: category.id,
    stateId: selectedState?.id,
    cityId: selectedCity?.id,
    pricingType,
    droneStatus,
    search,
  });

  const heading = category.h1_title || `${category.name} Pre-Wedding Photoshoot Locations`;

  return (
    <div>
      <section className="relative h-[420px] overflow-hidden sm:h-[480px]">
        {category.image_url ? (
          <Image
            src={category.image_url}
            alt={category.name}
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
        <div className="absolute inset-x-0 bottom-16 px-4 text-center sm:bottom-20 sm:px-6">
          <h1 className="font-heading text-3xl font-semibold text-white sm:text-4xl">{heading}</h1>
        </div>
      </section>

      <div className="relative z-10 mx-auto -mt-8 max-w-7xl px-4 sm:-mt-10 sm:px-6">
        <HomeFilter
          states={states}
          cities={cities}
          categories={[]}
          hideCategory
          basePath={`/category/${category.slug}`}
          initial={{
            q: query.q,
            state: query.state,
            city: query.city,
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
            { name: category.name, path: `/category/${category.slug}` },
          ]}
        />

        {category.description && (
          <p className="mb-6 max-w-2xl text-muted-foreground">{category.description}</p>
        )}

        <h2 className="font-heading mb-6 text-xl font-semibold">
          {locations.length} location{locations.length === 1 ? "" : "s"} found
        </h2>

        {locations.length === 0 ? (
          <p className="text-muted-foreground">
            No published {category.name.toLowerCase()} locations match these filters yet. Try a
            different combination.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
            {locations.map((location) => (
              <LocationCard key={location.id} location={location} />
            ))}
          </div>
        )}

        {/* Only shown for the default (unfiltered) national view — `locations`
            here is the full nationwide result set, so the state breakdown is
            accurate. When a state/city/pricing filter is active this would
            otherwise show a misleading subset, so it's skipped, matching the
            same browse-vs-filtered split already used on the City/State pages. */}
        {!hasFilters && <ExploreByState category={category} locations={locations} />}
      </div>

      <JsonLd
        data={buildItemListJsonLd(
          heading,
          locations.map((l) => ({ name: l.name, path: `/location/${l.slug}` })),
        )}
      />
    </div>
  );
}

/** State-level browse links for this category — reuses the already-loaded
 * nationwide `locations` result (grouped in memory, no extra query). Only
 * links to States, never individual City + Category pages, to keep this
 * page's outbound link count small and hierarchical. */
function ExploreByState({
  category,
  locations,
}: {
  category: { name: string; slug: string };
  locations: PublicLocationCard[];
}) {
  const stateCounts = new Map<
    string,
    { name: string; slug: string; countrySlug: string; count: number }
  >();
  for (const location of locations) {
    if (!location.state || !location.country) continue;
    const existing = stateCounts.get(location.state.slug);
    if (existing) existing.count += 1;
    else {
      stateCounts.set(location.state.slug, {
        name: location.state.name,
        slug: location.state.slug,
        countrySlug: location.country.slug,
        count: 1,
      });
    }
  }
  const states = [...stateCounts.values()].sort((a, b) => a.name.localeCompare(b.name));
  if (states.length === 0) return null;

  return (
    <div className="mt-10 border-t pt-6">
      <h2 className="font-heading mb-3 text-lg font-semibold">
        Explore {category.name} Locations by State
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {states.map((state) => (
          <Link
            key={state.slug}
            href={`/locations/${state.countrySlug}/${state.slug}/${category.slug}`}
            className="rounded-lg border p-4 transition-shadow hover:shadow-md"
          >
            <h3 className="text-lg font-semibold">
              {category.name} locations in {state.name}
            </h3>
            <p className="text-sm text-muted-foreground">
              {state.count} location{state.count === 1 ? "" : "s"}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
