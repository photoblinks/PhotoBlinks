import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getActiveCities,
  getActiveStates,
  getPublishedLocations,
  groupLocationsByCategory,
} from "@/lib/public-data";
import { LocationCard } from "@/components/public/location-card";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { DEFAULT_OG_IMAGE } from "@/lib/jsonld";

type Props = { params: Promise<{ state: string; city: string }> };

const loadCityPage = cache(async (stateSlug: string, citySlug: string) => {
  const states = await getActiveStates();
  const state = states.find((s) => s.slug === stateSlug);
  if (!state) return null;

  const cities = await getActiveCities();
  const city = cities.find((c) => c.slug === citySlug && c.state_id === state.id);
  if (!city) return null;

  const locations = await getPublishedLocations({ stateId: state.id, cityId: city.id });
  if (locations.length === 0) return null;

  return { state, city, locations };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { state: stateSlug, city: citySlug } = await params;
  const data = await loadCityPage(stateSlug, citySlug);
  if (!data) return {};

  const title = `Photoshoot Locations in ${data.city.name}`;
  const description = `Explore photoshoot locations in ${data.city.name}, ${data.state.name}, including beaches, temples, waterfalls, hills and other scenic locations.`;

  return {
    title,
    description,
    alternates: { canonical: `/locations/${data.state.slug}/${data.city.slug}` },
    openGraph: {
      title: `${title} | PhotoBlinks`,
      description,
      url: `/locations/${data.state.slug}/${data.city.slug}`,
      siteName: "PhotoBlinks",
      type: "website",
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

export default async function CityLocationsPage({ params }: Props) {
  const { state: stateSlug, city: citySlug } = await params;
  const data = await loadCityPage(stateSlug, citySlug);
  if (!data) notFound();

  const { state, city, locations } = data;

  const categoryMap = new Map<string, { name: string; slug: string }>();
  for (const location of locations) {
    if (location.category) categoryMap.set(location.category.slug, location.category);
  }
  const categories = [...categoryMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  const grouped = groupLocationsByCategory(locations);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Breadcrumbs
        items={[
          { name: "Home", path: "/" },
          { name: "Locations", path: "/locations" },
          { name: state.name, path: `/locations/${state.slug}` },
          { name: city.name, path: `/locations/${state.slug}/${city.slug}` },
        ]}
      />
      <h1 className="font-heading text-3xl font-semibold sm:text-4xl">Photoshoot Locations in {city.name}</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Explore photoshoot locations in {city.name}, {state.name}, including{" "}
        {categories.map((c) => c.name.toLowerCase()).join(", ")} and other scenic spots.
      </p>

      <div className="mt-8">
        {categories.map((category) => {
          const items = grouped.get(category.slug) ?? [];
          if (items.length === 0) return null;
          return (
            <section key={category.slug} className="mb-14">
              <h2 className="font-heading mb-4 text-2xl font-semibold">{category.name}</h2>
              <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
                {items.map((location) => (
                  <LocationCard key={location.id} location={location} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
