import { Suspense, cache } from "react";
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
import { HomeFilter } from "@/components/public/home-filter";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { DirectoryFilter, DirectoryResults } from "@/components/public/location-directory";
import { FlatBrowse } from "@/components/public/location-browse-views";
import { JsonLd } from "@/components/public/json-ld";
import { LocationFactsStrip } from "@/components/public/location-facts-strip";
import { EditorialSection } from "@/components/public/editorial-section";
import { DEFAULT_OG_IMAGE, buildItemListJsonLd } from "@/lib/jsonld";
import {
  buildCategoryCityDefaultDescription,
  buildCategoryCityDefaultTitle,
} from "@/lib/seo-templates";
import { isSeoEligible } from "@/lib/seo-eligibility";
import { summarizeLocationFacts } from "@/lib/location-facts";

// ISR: no searchParams/cookies read, so the route is eligible for the Full
// Route Cache with the same 60s window as public-data.ts. The interactive
// filter (city/category overrides, pricing, drone, search) and pagination
// run client-side.
export const revalidate = 60;

export async function generateStaticParams() {
  return [];
}

type Props = {
  params: Promise<{ country: string; state: string; city: string; category: string }>;
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
    ...(isSeoEligible(data.locations.length)
      ? {}
      : { robots: { index: false, follow: true } }),
  };
}

export default async function CategoryLocationsPage({ params }: Props) {
  const { country: countrySlug, state: stateSlug, city: citySlug, category: categorySlug } = await params;
  const data = await loadCategoryPage(countrySlug, stateSlug, citySlug, categorySlug);
  if (!data) notFound();

  const { cities, categories, state, city, category, locations } = data;

  const heading = `${category.name} Pre-Wedding Photoshoot Locations in ${city.name}`;
  // Always derived from the canonical (unfiltered) location set — never the
  // interactive filter preview, so it stays consistent with the H1.
  const facts = summarizeLocationFacts(locations);
  const canonicalHeading = `${locations.length} ${category.name} Pre-Wedding Location${
    locations.length === 1 ? "" : "s"
  } in ${city.name}`;
  const breadcrumbs = [
    { name: "Home", path: "/" },
    { name: "Locations", path: "/locations" },
    { name: state.country!.name, path: `/locations/${countrySlug}` },
    { name: state.name, path: `/locations/${countrySlug}/${state.slug}` },
    { name: city.name, path: `/locations/${countrySlug}/${state.slug}/${city.slug}` },
    {
      name: category.name,
      path: `/locations/${countrySlug}/${state.slug}/${city.slug}/${category.slug}`,
    },
  ];
  const basePath = `/locations/${countrySlug}/${state.slug}/${city.slug}/${category.slug}`;
  const stateCities = cities.filter((c) => c.state_id === state.id);

  return (
    <div>
      <section className="relative overflow-hidden bg-linear-to-br from-emerald-950 via-pb-brand to-emerald-800 pt-10 pb-20 sm:pt-14 sm:pb-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h1 className="font-heading text-3xl font-semibold text-white sm:text-4xl">{heading}</h1>
        </div>
      </section>

      <div className="relative z-10 mx-auto -mt-10 max-w-7xl px-4 sm:px-6">
        <Suspense
          fallback={
            <HomeFilter
              states={[state]}
              cities={stateCities}
              categories={categories}
              hideState
              basePath={basePath}
              initial={{ state: state.slug, city: city.slug, category: category.slug }}
            />
          }
        >
          <DirectoryFilter
            mode="cityCategory"
            states={[state]}
            cities={stateCities}
            categories={categories}
            basePath={basePath}
            fixedState={{ name: state.name, slug: state.slug }}
            fixedCity={{ name: city.name, slug: city.slug }}
            fixedCategory={{ name: category.name, slug: category.slug }}
          />
        </Suspense>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <Breadcrumbs items={breadcrumbs} />

        <LocationFactsStrip facts={facts} categoryName={category.name} />

        <Suspense
          fallback={
            <FlatBrowse
              heading={canonicalHeading}
              locations={locations}
              page={undefined}
              basePath={basePath}
              query={{}}
            />
          }
        >
          <DirectoryResults
            mode="cityCategory"
            locations={locations}
            states={[state]}
            cities={stateCities}
            categories={categories}
            basePath={basePath}
            fixedState={{ name: state.name, slug: state.slug }}
            fixedCity={{ name: city.name, slug: city.slug }}
            fixedCategory={{ name: category.name, slug: category.slug }}
            countrySlug={countrySlug}
            heading={canonicalHeading}
          />
        </Suspense>

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

        <EditorialSection stateId={state.id} categoryId={category.id} />
      </div>

      {/* Always describes this page's own canonical city+category result
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
