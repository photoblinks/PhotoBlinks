import { Suspense, cache } from "react";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getActiveCategories,
  getActiveCities,
  getActiveStates,
  getPublishedLocations,
} from "@/lib/public-data";
import { HomeFilter } from "@/components/public/home-filter";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { DirectoryFilter, DirectoryResults } from "@/components/public/location-directory";
import { StateBrowse } from "@/components/public/location-browse-views";
import { EditorialSection } from "@/components/public/editorial-section";
import { DEFAULT_OG_IMAGE, socialImageUrl } from "@/lib/jsonld";
import { isSeoEligible } from "@/lib/seo-eligibility";
import { buildGeoDefaultDescription, extractCategoryNames } from "@/lib/seo-templates";

// ISR: no searchParams/cookies read, so the route is eligible for the Full
// Route Cache with the same 60s window as public-data.ts. Filtering and
// pagination run client-side (DirectoryFilter/DirectoryResults).
export const revalidate = 60;

export async function generateStaticParams() {
  return [];
}

type Props = {
  params: Promise<{ country: string; state: string }>;
};

const loadStatePage = cache(async (countrySlug: string, stateSlug: string) => {
  const states = await getActiveStates();
  const state = states.find((s) => s.slug === stateSlug && s.country?.slug === countrySlug);
  if (!state) return null;

  const locations = await getPublishedLocations({ stateId: state.id });
  if (locations.length === 0) return null;

  return { state, locations };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { country: countrySlug, state: stateSlug } = await params;
  const data = await loadStatePage(countrySlug, stateSlug);
  if (!data) return {};

  const title = data.state.meta_title || `Pre-Wedding Photoshoot Locations in ${data.state.name}`;
  const description =
    data.state.meta_description ||
    buildGeoDefaultDescription(data.state.name, null, extractCategoryNames(data.locations));
  const path = `/locations/${countrySlug}/${data.state.slug}`;

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
      images: [data.state.image_url ? socialImageUrl(data.state.image_url) : DEFAULT_OG_IMAGE],
    },
    // Below the SEO eligibility threshold the page still renders for
    // product/UX purposes but shouldn't be indexed — see seo-eligibility.ts.
    ...(isSeoEligible(data.locations.length)
      ? {}
      : { robots: { index: false, follow: true } }),
  };
}

export default async function StateLocationsPage({ params }: Props) {
  const { country: countrySlug, state: stateSlug } = await params;
  const data = await loadStatePage(countrySlug, stateSlug);
  if (!data) notFound();

  const { state, locations } = data;

  const [allCities, categories] = await Promise.all([getActiveCities(), getActiveCategories()]);
  const cities = allCities.filter((c) => c.state_id === state.id);

  const heading = state.h1_title || `Pre-Wedding Photoshoot Locations in ${state.name}`;
  const breadcrumbs = [
    { name: "Home", path: "/" },
    { name: "Locations", path: "/locations" },
    { name: state.country!.name, path: `/locations/${countrySlug}` },
    { name: state.name, path: `/locations/${countrySlug}/${state.slug}` },
  ];
  const basePath = `/locations/${countrySlug}/${state.slug}`;

  return (
    <div>
      <section className="relative h-[360px] overflow-hidden sm:h-[420px]">
        {state.image_url ? (
          <Image
            src={state.image_url}
            alt={state.name}
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
              states={[state]}
              cities={cities}
              categories={categories}
              hideState
              basePath={basePath}
              initial={{ state: state.slug }}
            />
          }
        >
          <DirectoryFilter
            mode="state"
            states={[state]}
            cities={cities}
            categories={categories}
            basePath={basePath}
            fixedState={{ name: state.name, slug: state.slug }}
          />
        </Suspense>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <Breadcrumbs items={breadcrumbs} />
        <Suspense
          fallback={
            <StateBrowse
              countrySlug={countrySlug}
              state={state}
              locations={locations}
              page={undefined}
              basePath={basePath}
              query={{}}
            />
          }
        >
          <DirectoryResults
            mode="state"
            locations={locations}
            states={[state]}
            cities={cities}
            categories={categories}
            basePath={basePath}
            fixedState={{ name: state.name, slug: state.slug }}
            countrySlug={countrySlug}
          />
        </Suspense>
        <EditorialSection stateId={state.id} categoryId={null} />
      </div>
    </div>
  );
}
