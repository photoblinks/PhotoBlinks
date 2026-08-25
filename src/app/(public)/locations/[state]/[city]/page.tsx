import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getActiveCities, getActiveStates, getPublishedLocations } from "@/lib/public-data";
import { LocationCard } from "@/components/public/location-card";
import { Breadcrumbs } from "@/components/public/breadcrumbs";

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
    },
  };
}

export default async function CityLocationsPage({ params }: Props) {
  const { state: stateSlug, city: citySlug } = await params;
  const data = await loadCityPage(stateSlug, citySlug);
  if (!data) notFound();

  const { state, city, locations } = data;

  const categoryMap = new Map<string, { name: string; slug: string; count: number }>();
  for (const location of locations) {
    if (!location.category) continue;
    const existing = categoryMap.get(location.category.slug);
    if (existing) existing.count += 1;
    else categoryMap.set(location.category.slug, { ...location.category, count: 1 });
  }
  const categories = [...categoryMap.values()].sort((a, b) => a.name.localeCompare(b.name));

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

      {categories.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {categories.map((category) => (
            <Link
              key={category.slug}
              href={`/locations/${state.slug}/${city.slug}/${category.slug}`}
              className="rounded-full border px-3 py-1 text-sm hover:bg-muted"
            >
              {category.name} ({category.count})
            </Link>
          ))}
        </div>
      )}

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {locations.map((location) => (
          <LocationCard key={location.id} location={location} />
        ))}
      </div>
    </div>
  );
}
