import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getActiveCities, getActiveStates, getPublishedStudios } from "@/lib/public-data";
import { StudioCard } from "@/components/public/studio-card";
import { Breadcrumbs } from "@/components/public/breadcrumbs";

type Props = { params: Promise<{ state: string; city: string }> };

const loadCityPage = cache(async (stateSlug: string, citySlug: string) => {
  const states = await getActiveStates();
  const state = states.find((s) => s.slug === stateSlug);
  if (!state) return null;

  const cities = await getActiveCities();
  const city = cities.find((c) => c.slug === citySlug && c.state_id === state.id);
  if (!city) return null;

  const studios = await getPublishedStudios({ stateId: state.id, cityId: city.id });
  if (studios.length === 0) return null;

  return { state, city, studios };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { state: stateSlug, city: citySlug } = await params;
  const data = await loadCityPage(stateSlug, citySlug);
  if (!data) return {};

  const title = `Photography Studios in ${data.city.name}`;
  const description = `Browse photography studios in ${data.city.name}, ${data.state.name} for indoor and preset photoshoots.`;

  return {
    title,
    description,
    alternates: { canonical: `/studios/${data.state.slug}/${data.city.slug}` },
    openGraph: {
      title: `${title} | PhotoBlinks`,
      description,
      url: `/studios/${data.state.slug}/${data.city.slug}`,
      siteName: "PhotoBlinks",
      type: "website",
    },
  };
}

export default async function CityStudiosPage({ params }: Props) {
  const { state: stateSlug, city: citySlug } = await params;
  const data = await loadCityPage(stateSlug, citySlug);
  if (!data) notFound();

  const { state, city, studios } = data;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Breadcrumbs
        items={[
          { name: "Home", path: "/" },
          { name: "Studios", path: "/studios" },
          { name: state.name, path: `/studios/${state.slug}` },
          { name: city.name, path: `/studios/${state.slug}/${city.slug}` },
        ]}
      />
      <h1 className="font-heading text-3xl font-semibold sm:text-4xl">Photography Studios in {city.name}</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Browse photography studios in {city.name}, {state.name} for indoor and preset photoshoots.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {studios.map((studio) => (
          <StudioCard key={studio.id} studio={studio} />
        ))}
      </div>
    </div>
  );
}
