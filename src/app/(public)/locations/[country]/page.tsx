import { Suspense, cache } from "react";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getActiveCategories,
  getActiveCities,
  getActiveCountries,
  getActiveStates,
  getPublishedLocations,
} from "@/lib/public-data";
import { HomeFilter } from "@/components/public/home-filter";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { DirectoryFilter, DirectoryResults } from "@/components/public/location-directory";
import { CountryBrowse } from "@/components/public/location-browse-views";
import { DEFAULT_OG_IMAGE, socialImageUrl } from "@/lib/jsonld";
import { isSeoEligible } from "@/lib/seo-eligibility";

// ISR: this page no longer reads searchParams/cookies, so it is eligible for
// the Full Route Cache with the same 60s window as the underlying cached
// queries in public-data.ts. Filtering/pagination run client-side
// (DirectoryFilter/DirectoryResults) so ?state=/?category=/?page= variants
// don't force a dynamic render.
export const revalidate = 60;

export async function generateStaticParams() {
  return [];
}

type Props = {
  params: Promise<{ country: string }>;
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

  const title =
    data.country.meta_title || `Pre-Wedding Photoshoot Locations in ${data.country.name}`;
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
      images: [data.country.image_url ? socialImageUrl(data.country.image_url) : DEFAULT_OG_IMAGE],
    },
    // Below the SEO eligibility threshold the page still renders for
    // product/UX purposes but shouldn't be indexed — see seo-eligibility.ts.
    // Never affects the country's individual location pages, which are
    // always indexable when published.
    ...(isSeoEligible(data.locations.length)
      ? {}
      : { robots: { index: false, follow: true } }),
  };
}

export default async function CountryLocationsPage({ params }: Props) {
  const { country: countrySlug } = await params;
  const data = await loadCountryPage(countrySlug);
  if (!data) notFound();

  const { country, locations } = data;

  const [allStates, allCities, categories] = await Promise.all([
    getActiveStates(),
    getActiveCities(),
    getActiveCategories(),
  ]);
  const states = allStates.filter((s) => s.country_id === country.id);
  const cities = allCities.filter((c) => states.some((s) => s.id === c.state_id));

  const heading = country.h1_title || `Pre-Wedding Photoshoot Locations in ${country.name}`;
  const breadcrumbs = [
    { name: "Home", path: "/" },
    { name: "Locations", path: "/locations" },
    { name: country.name, path: `/locations/${country.slug}` },
  ];
  const basePath = `/locations/${country.slug}`;

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

      <div className="relative z-10 mx-auto -mt-8 max-w-7xl px-4 sm:-mt-10 sm:px-6">
        <Suspense
          fallback={
            <HomeFilter
              states={states}
              cities={cities}
              categories={categories}
              basePath={basePath}
              initial={{}}
            />
          }
        >
          <DirectoryFilter
            mode="country"
            states={states}
            cities={cities}
            categories={categories}
            basePath={basePath}
          />
        </Suspense>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <Breadcrumbs items={breadcrumbs} />
        <Suspense fallback={<CountryBrowse country={country} locations={locations} />}>
          <DirectoryResults
            mode="country"
            locations={locations}
            states={states}
            cities={cities}
            categories={categories}
            basePath={basePath}
            country={{ name: country.name, slug: country.slug }}
          />
        </Suspense>
      </div>
    </div>
  );
}
