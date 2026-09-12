import { cache } from "react";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getActiveCategories,
  getActiveCities,
  getActiveStates,
  getLocationStateCategorySeo,
  getPublishedLocations,
  groupLocationsByCategory,
  type PublicLocationCard,
} from "@/lib/public-data";
import { HomeFilter } from "@/components/public/home-filter";
import { LocationCard } from "@/components/public/location-card";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { JsonLd } from "@/components/public/json-ld";
import { LocationFactsStrip } from "@/components/public/location-facts-strip";
import { DEFAULT_OG_IMAGE, buildItemListJsonLd } from "@/lib/jsonld";
import {
  buildStateCategoryDefaultDescription,
  buildStateCategoryDefaultTitle,
} from "@/lib/seo-templates";
import { isSeoEligible } from "@/lib/seo-eligibility";
import { summarizeLocationFacts } from "@/lib/location-facts";

type Props = {
  params: Promise<{ country: string; state: string; city: string }>;
  // "city" is the folder's param name (unchanged, for minimal diff) but the
  // third path segment resolves to either a real city (existing behavior,
  // byte-identical) or, when no city matches, a category slug — rendering
  // the State + Category SEO page instead. Next.js requires every route at
  // this position to share one dynamic segment name, so State + Category
  // could not live in a sibling [category] folder alongside [city]; the two
  // page types are resolved from the same segment here instead.
  searchParams: Promise<{ q?: string; city?: string; category?: string; pricing?: string; drone?: string }>;
};

// Cities are checked first: they're the larger, free-form namespace and
// this is the established, longer-lived page identity. Categories are a
// small curated admin list, so this ordering only matters in the
// vanishingly unlikely case a city slug collides with a category slug —
// the city wins, and no existing city URL can be affected by adding
// State + Category support.
const loadSegmentPage = cache(async (countrySlug: string, stateSlug: string, slug: string) => {
  const states = await getActiveStates();
  const state = states.find((s) => s.slug === stateSlug && s.country?.slug === countrySlug);
  if (!state) return null;

  const cities = await getActiveCities();
  const city = cities.find((c) => c.slug === slug && c.state_id === state.id);
  if (city) {
    const locations = await getPublishedLocations({ stateId: state.id, cityId: city.id });
    if (locations.length === 0) return null;
    return { kind: "city" as const, state, city, locations };
  }

  const categories = await getActiveCategories();
  const category = categories.find((c) => c.slug === slug);
  if (!category) return null;

  const locations = await getPublishedLocations({ stateId: state.id, categoryId: category.id });
  if (locations.length === 0) return null;

  const seo = await getLocationStateCategorySeo(state.id, category.id);
  return { kind: "stateCategory" as const, state, category, locations, seo, cities, categories };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { country: countrySlug, state: stateSlug, city: slug } = await params;
  const data = await loadSegmentPage(countrySlug, stateSlug, slug);
  if (!data) return {};

  if (data.kind === "city") {
    const title = data.city.meta_title || `Pre-Wedding Photoshoot Locations in ${data.city.name}`;
    const description =
      data.city.meta_description ||
      `Explore pre-wedding photoshoot locations in ${data.city.name}, ${data.state.name}, including beaches, temples, waterfalls, hills and other scenic locations.`;
    const path = `/locations/${countrySlug}/${data.state.slug}/${data.city.slug}`;

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
        images: [data.city.image_url ?? DEFAULT_OG_IMAGE],
      },
      // Below the SEO eligibility threshold the page still renders for
      // product/UX purposes but shouldn't be indexed — see
      // seo-eligibility.ts. Never affects the city's individual location
      // pages, which are always indexable when published.
      ...(isSeoEligible(data.locations.length) ? {} : { robots: { index: false, follow: true } }),
    };
  }

  const title =
    data.seo?.meta_title || buildStateCategoryDefaultTitle(data.category.name, data.state.name);
  const description =
    data.seo?.meta_description ||
    buildStateCategoryDefaultDescription(data.category.name, data.state.name);
  const path = `/locations/${countrySlug}/${data.state.slug}/${data.category.slug}`;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: `${title} | PhotoBlinks`,
      description,
      url: path,
      siteName: "PhotoBlinks",
      type: "website",
      images: [DEFAULT_OG_IMAGE],
    },
    // Below the SEO eligibility threshold the page still renders for
    // product/UX purposes but shouldn't be indexed — see seo-eligibility.ts.
    ...(isSeoEligible(data.locations.length) ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function LocationsCityOrStateCategoryPage({ params, searchParams }: Props) {
  const { country: countrySlug, state: stateSlug, city: slug } = await params;
  const data = await loadSegmentPage(countrySlug, stateSlug, slug);
  if (!data) notFound();

  if (data.kind === "city") {
    const { state, city, locations } = data;
    const query = await searchParams;

    const categories = await getActiveCategories();
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
    const hasFilters = Boolean(selectedCategory || pricingType || droneStatus || search);

    const heading = city.h1_title || `Pre-Wedding Photoshoot Locations in ${city.name}`;

    return (
      <div>
        <section className="relative h-[360px] overflow-hidden sm:h-[420px]">
          {city.image_url ? (
            <Image src={city.image_url} alt={city.name} fill priority className="object-cover" />
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
            cities={[city]}
            categories={categories}
            hideState
            hideCity
            basePath={`/locations/${countrySlug}/${state.slug}/${city.slug}`}
            initial={{
              q: query.q,
              state: state.slug,
              city: city.slug,
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
              { name: city.name, path: `/locations/${countrySlug}/${state.slug}/${city.slug}` },
            ]}
          />

          {hasFilters ? (
            <FilteredResults
              stateId={state.id}
              cityId={city.id}
              categoryId={selectedCategory?.id}
              pricingType={pricingType}
              droneStatus={droneStatus}
              search={search}
            />
          ) : (
            <BrowseCity countrySlug={countrySlug} state={state} city={city} locations={locations} />
          )}
        </div>
      </div>
    );
  }

  const { state, category, locations, cities, categories } = data;
  const query = await searchParams;

  const overrideCity = query.city
    ? cities.find((c) => c.slug === query.city && c.state_id === state.id)
    : undefined;
  const overrideCategory = categories.find((c) => c.slug === query.category) ?? category;
  const pricingType =
    query.pricing === "free" || query.pricing === "paid" || query.pricing === "unknown"
      ? query.pricing
      : undefined;
  const droneStatus =
    query.drone === "allowed" || query.drone === "allowed_with_permission" || query.drone === "not_allowed"
      ? query.drone
      : undefined;
  const search = query.q?.trim() || undefined;
  const hasFilters = Boolean(
    overrideCity ||
      (query.category && overrideCategory.id !== category.id) ||
      pricingType ||
      droneStatus ||
      search,
  );

  const heading = buildStateCategoryDefaultTitle(category.name, state.name);
  // Always derived from the canonical (unfiltered) location set — never the
  // interactive filter preview below, so it stays consistent with the H1
  // regardless of what the user is currently previewing (see Phase 5/9).
  const facts = summarizeLocationFacts(locations);

  return (
    <div>
      <section className="relative overflow-hidden bg-linear-to-br from-emerald-950 via-pb-brand to-emerald-800 pt-10 pb-20 sm:pt-14 sm:pb-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h1 className="font-heading text-3xl font-semibold text-white sm:text-4xl">{heading}</h1>
        </div>
      </section>

      <div className="relative z-10 mx-auto -mt-10 max-w-7xl px-4 sm:px-6">
        <HomeFilter
          states={[state]}
          cities={cities.filter((c) => c.state_id === state.id)}
          categories={categories}
          hideState
          basePath={`/locations/${countrySlug}/${state.slug}/${category.slug}`}
          initial={{
            q: query.q,
            state: state.slug,
            city: overrideCity?.slug,
            category: overrideCategory.slug,
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
            { name: category.name, path: `/locations/${countrySlug}/${state.slug}/${category.slug}` },
          ]}
        />

        <LocationFactsStrip facts={facts} categoryName={category.name} />

        {hasFilters ? (
          <StateCategoryFilteredResults
            stateId={state.id}
            cityId={overrideCity?.id}
            areaName={overrideCity?.name ?? state.name}
            categoryId={overrideCategory.id}
            categoryName={overrideCategory.name}
            pricingType={pricingType}
            droneStatus={droneStatus}
            search={search}
          />
        ) : (
          <>
            <h2 className="font-heading mb-6 text-xl font-semibold">
              {locations.length} {category.name} Pre-Wedding Location{locations.length === 1 ? "" : "s"} in{" "}
              {state.name}
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {locations.map((location) => (
                <LocationCard key={location.id} location={location} />
              ))}
            </div>
          </>
        )}

        <div className="mt-10 border-t pt-6">
          <h2 className="font-heading mb-3 text-xl font-semibold">Explore More Locations</h2>
          <ul className="flex flex-col gap-2 text-sm">
            <li>
              <Link
                href={`/locations/${countrySlug}/${state.slug}`}
                className="font-medium text-pb-brand hover:underline"
              >
                All pre-wedding photoshoot locations in {state.name}
              </Link>
            </li>
            <li>
              <Link
                href={`/locations/${countrySlug}`}
                className="font-medium text-pb-brand hover:underline"
              >
                All pre-wedding photoshoot locations in {state.country!.name}
              </Link>
            </li>
            <li>
              <Link
                href={`/category/${category.slug}`}
                className="font-medium text-pb-brand hover:underline"
              >
                Explore {category.name} locations across {state.country!.name}
              </Link>
            </li>
          </ul>
        </div>
      </div>

      {/* Always describes this page's own canonical state+category result
          set — never the filter preview above. */}
      <JsonLd
        data={buildItemListJsonLd(
          heading,
          locations.map((l) => ({ name: l.name, path: `/location/${l.slug}` })),
        )}
      />
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
  cityId: string;
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

function BrowseCity({
  countrySlug,
  state,
  city,
  locations,
}: {
  countrySlug: string;
  state: { id: string; slug: string; name: string };
  city: { id: string; slug: string; name: string };
  locations: PublicLocationCard[];
}) {
  const categoryMap = new Map<string, { name: string; slug: string }>();
  for (const location of locations) {
    if (location.category) categoryMap.set(location.category.slug, location.category);
  }
  const categories = [...categoryMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  const grouped = groupLocationsByCategory(locations);

  return (
    <>
      <p className="mb-2 max-w-2xl text-muted-foreground">
        Explore pre-wedding photoshoot locations in {city.name}, {state.name}, including{" "}
        {categories.map((c) => c.name.toLowerCase()).join(", ")} and other scenic spots.
      </p>

      <div className="mt-8">
        {categories.map((category) => {
          const items = grouped.get(category.slug) ?? [];
          if (items.length === 0) return null;
          return (
            <section key={category.slug} className="mb-14">
              <Link
                href={`/locations/${countrySlug}/${state.slug}/${city.slug}/${category.slug}`}
                className="group inline-block"
              >
                <h2 className="font-heading mb-4 text-2xl font-semibold group-hover:underline">
                  {category.name} locations in {city.name}
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

async function StateCategoryFilteredResults({
  stateId,
  cityId,
  areaName,
  categoryId,
  categoryName,
  pricingType,
  droneStatus,
  search,
}: {
  stateId: string;
  cityId?: string;
  areaName: string;
  categoryId: string;
  categoryName: string;
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
        {results.length} {categoryName} Pre-Wedding Location{results.length === 1 ? "" : "s"} in {areaName}
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
    </>
  );
}
