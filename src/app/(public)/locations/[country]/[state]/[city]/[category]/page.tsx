import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getActiveCategories,
  getActiveCities,
  getActiveStates,
  getLocationCategorySeo,
  getPublishedLocations,
} from "@/lib/public-data";
import { LocationCard } from "@/components/public/location-card";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { HomeFilter } from "@/components/public/home-filter";
import { JsonLd } from "@/components/public/json-ld";
import { LocationFactsStrip } from "@/components/public/location-facts-strip";
import { DEFAULT_OG_IMAGE, buildItemListJsonLd } from "@/lib/jsonld";
import { buildCategoryCityDefaultDescription, buildCategoryCityDefaultTitle } from "@/lib/seo-templates";
import { isSeoEligible } from "@/lib/seo-eligibility";
import { summarizeLocationFacts } from "@/lib/location-facts";

type Props = {
  params: Promise<{ country: string; state: string; city: string; category: string }>;
  // Query-string overrides for the on-page discovery filter (city/category/
  // pricing) — UX only. They change which locations are DISPLAYED but never
  // the page's own SEO identity (H1, canonical, metadata, JSON-LD all stay
  // pinned to the route's own city+category, exactly like the sibling City
  // page's `?category=` filter). Reading searchParams makes this route
  // dynamic instead of ISR — same tradeoff already accepted on the City
  // page and homepage for the same reason.
  searchParams: Promise<{ q?: string; city?: string; category?: string; pricing?: string; drone?: string }>;
};

const loadCategoryPage = cache(
  async (countrySlug: string, stateSlug: string, citySlug: string, categorySlug: string) => {
    const states = await getActiveStates();
    const state = states.find((s) => s.slug === stateSlug && s.country?.slug === countrySlug);
    if (!state) return null;

    const cities = await getActiveCities();
    const city = cities.find((c) => c.slug === citySlug && c.state_id === state.id);
    if (!city) return null;

    const categories = await getActiveCategories();
    const category = categories.find((c) => c.slug === categorySlug);
    if (!category) return null;

    const locations = await getPublishedLocations({
      stateId: state.id,
      cityId: city.id,
      categoryId: category.id,
    });
    if (locations.length === 0) return null;

    const seo = await getLocationCategorySeo(city.id, category.id);

    return { states, cities, categories, state, city, category, locations, seo };
  },
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { country: countrySlug, state: stateSlug, city: citySlug, category: categorySlug } = await params;
  const data = await loadCategoryPage(countrySlug, stateSlug, citySlug, categorySlug);
  if (!data) return {};

  const title =
    data.seo?.meta_title || buildCategoryCityDefaultTitle(data.category.name, data.city.name);
  const description =
    data.seo?.meta_description ||
    buildCategoryCityDefaultDescription(data.category.name, data.city.name, data.state.name);
  const path = `/locations/${countrySlug}/${data.state.slug}/${data.city.slug}/${data.category.slug}`;

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

export default async function CategoryLocationsPage({ params, searchParams }: Props) {
  const { country: countrySlug, state: stateSlug, city: citySlug, category: categorySlug } = await params;
  const data = await loadCategoryPage(countrySlug, stateSlug, citySlug, categorySlug);
  if (!data) notFound();

  const { states, cities, categories, state, city, category, locations } = data;
  const query = await searchParams;

  // The discovery filter can preview a different city (within the same
  // state) or category without navigating away from this SEO page's own
  // URL — same "?category=" pattern the sibling City page already uses,
  // extended with an optional city override. Falls back to this page's own
  // city/category whenever the query doesn't actually pick a different one.
  const overrideCity = cities.find((c) => c.slug === query.city && c.state_id === state.id) ?? city;
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
    (query.city && overrideCity.id !== city.id) ||
      (query.category && overrideCategory.id !== category.id) ||
      pricingType ||
      droneStatus ||
      search,
  );

  const heading = `${category.name} Pre-Wedding Photoshoot Locations in ${city.name}`;
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
          basePath={`/locations/${countrySlug}/${state.slug}/${city.slug}/${category.slug}`}
          initial={{
            q: query.q,
            state: state.slug,
            city: overrideCity.slug,
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
            { name: city.name, path: `/locations/${countrySlug}/${state.slug}/${city.slug}` },
            {
              name: category.name,
              path: `/locations/${countrySlug}/${state.slug}/${city.slug}/${category.slug}`,
            },
          ]}
        />

        <LocationFactsStrip facts={facts} categoryName={category.name} />

        {hasFilters ? (
          <FilteredResults
            stateId={state.id}
            cityId={overrideCity.id}
            cityName={overrideCity.name}
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
              {city.name}
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
                href={`/locations/${countrySlug}/${state.slug}/${city.slug}`}
                className="font-medium text-pb-brand hover:underline"
              >
                All pre-wedding photoshoot locations in {city.name}
              </Link>
            </li>
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
                href={`/locations/${countrySlug}/${state.slug}/${category.slug}`}
                className="font-medium text-pb-brand hover:underline"
              >
                Explore more {category.name} locations in {state.name}
              </Link>
            </li>
          </ul>
        </div>
      </div>

      {/* Always describes this page's own canonical city+category result
          set — never the filter preview above — so it stays consistent
          with the H1/metadata regardless of what the user is previewing. */}
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
  cityName,
  categoryId,
  categoryName,
  pricingType,
  droneStatus,
  search,
}: {
  stateId: string;
  cityId: string;
  cityName: string;
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
        {results.length} {categoryName} Pre-Wedding Location{results.length === 1 ? "" : "s"} in {cityName}
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
