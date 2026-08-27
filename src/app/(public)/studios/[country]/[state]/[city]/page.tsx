import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getActiveCities, getActiveStates, getPublishedStudios } from "@/lib/public-data";
import { StudioCard } from "@/components/public/studio-card";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { DEFAULT_OG_IMAGE } from "@/lib/jsonld";

type Props = { params: Promise<{ country: string; state: string; city: string }> };

// No searchParams/cookies here, so this route is eligible for ISR — the
// same 60s window as the underlying cached data queries (public-data.ts).
// generateStaticParams is required (even empty) for a dynamic segment to
// use ISR at all — see the matching comment in location/[slug]/page.tsx.
export const revalidate = 60;

export async function generateStaticParams() {
  return [];
}

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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { country: countrySlug, state: stateSlug, city: citySlug } = await params;
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
  };
}

export default async function CityStudiosPage({ params }: Props) {
  const { country: countrySlug, state: stateSlug, city: citySlug } = await params;
  const data = await loadCityPage(countrySlug, stateSlug, citySlug);
  if (!data) notFound();

  const { state, city, studios } = data;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
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

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {studios.map((studio) => (
          <StudioCard key={studio.id} studio={studio} />
        ))}
      </div>
    </div>
  );
}
