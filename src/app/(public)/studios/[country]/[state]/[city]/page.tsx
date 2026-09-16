import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getActiveCities, getActiveStates, getPublishedStudios } from "@/lib/public-data";
import { StudioCard } from "@/components/public/studio-card";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { StudioSearch } from "@/components/public/studio-search";
import { DEFAULT_OG_IMAGE } from "@/lib/jsonld";
import { hasIndexAffectingParams } from "@/lib/seo-eligibility";

type Props = {
  params: Promise<{ country: string; state: string; city: string }>;
  // Reading searchParams makes this route dynamic instead of ISR — the same
  // tradeoff already accepted on the location directory pages.
  searchParams: Promise<{ q?: string }>;
};

const loadCityPage = cache(async (countrySlug: string, stateSlug: string, citySlug: string) => {
  const states = await getActiveStates();
  const state = states.find((s) => s.slug === stateSlug && s.country?.slug === countrySlug);
  if (!state) return null;

  const cities = await getActiveCities();
  const city = cities.find((c) => c.slug === citySlug && c.state_id === state.id);
  if (!city) return null;

  const studios = await getPublishedStudios({ stateId: state.id, cityId: city.id });
  if (studios.length === 0) return null;

  return { state, city, studios };
});

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { country: countrySlug, state: stateSlug, city: citySlug } = await params;
  const query = await searchParams;
  const data = await loadCityPage(countrySlug, stateSlug, citySlug);
  if (!data) return {};

  const title = `Pre-Wedding Photo Studios in ${data.city.name}`;
  const description = `Browse pre-wedding photo studios in ${data.city.name}, ${data.state.name} for indoor and preset photoshoots.`;
  const path = `/studios/${countrySlug}/${data.state.slug}/${data.city.slug}`;

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
    // The "?q=" search variant is noindexed since it canonicalizes to this
    // same clean URL and isn't meant to be its own landing page.
    ...(hasIndexAffectingParams(query) ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function CityStudiosPage({ params, searchParams }: Props) {
  const { country: countrySlug, state: stateSlug, city: citySlug } = await params;
  const data = await loadCityPage(countrySlug, stateSlug, citySlug);
  if (!data) notFound();

  const { state, city, studios: allStudios } = data;
  const { q } = await searchParams;
  const search = q?.trim().toLowerCase();
  const studios = search
    ? allStudios.filter((s) => s.name.toLowerCase().includes(search))
    : allStudios;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Breadcrumbs
        items={[
          { name: "Home", path: "/" },
          { name: "Studios", path: "/studios" },
          { name: state.country!.name, path: `/studios/${countrySlug}` },
          { name: state.name, path: `/studios/${countrySlug}/${state.slug}` },
          { name: city.name, path: `/studios/${countrySlug}/${state.slug}/${city.slug}` },
        ]}
      />
      <h1 className="font-heading text-3xl font-semibold sm:text-4xl">
        Pre-Wedding Photo Studios in {city.name}
      </h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Browse pre-wedding photo studios in {city.name}, {state.name} for indoor and preset photoshoots.
      </p>

      <StudioSearch basePath={`/studios/${countrySlug}/${state.slug}/${city.slug}`} q={q} />

      {studios.length === 0 ? (
        <p className="mt-8 text-muted-foreground">
          No published studios match &ldquo;{q}&rdquo;. Try a different search.
        </p>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {studios.map((studio) => (
            <StudioCard key={studio.id} studio={studio} />
          ))}
        </div>
      )}
    </div>
  );
}
