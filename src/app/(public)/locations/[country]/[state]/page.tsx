import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getActiveStates, getPublishedLocations, groupLocationsByCategory } from "@/lib/public-data";
import { LocationCard } from "@/components/public/location-card";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { DEFAULT_OG_IMAGE } from "@/lib/jsonld";

type Props = { params: Promise<{ country: string; state: string }> };

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

  const title = `Photoshoot Locations in ${data.state.name}`;
  const description = `Explore photoshoot locations in ${data.state.name}, including beaches, temples, waterfalls, hills and other scenic spots.`;
  const path = `/locations/${countrySlug}/${data.state.slug}`;

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

export default async function StateLocationsPage({ params }: Props) {
  const { country: countrySlug, state: stateSlug } = await params;
  const data = await loadStatePage(countrySlug, stateSlug);
  if (!data) notFound();

  const { state, locations } = data;

  const cityMap = new Map<string, { name: string; slug: string; count: number }>();
  const categoryMap = new Map<string, { name: string; slug: string }>();
  for (const location of locations) {
    if (location.city) {
      const existing = cityMap.get(location.city.slug);
      if (existing) existing.count += 1;
      else cityMap.set(location.city.slug, { ...location.city, count: 1 });
    }
    if (location.category) categoryMap.set(location.category.slug, location.category);
  }
  const cities = [...cityMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  const categories = [...categoryMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  const grouped = groupLocationsByCategory(locations);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Breadcrumbs
        items={[
          { name: "Home", path: "/" },
          { name: "Locations", path: "/locations" },
          { name: state.country!.name, path: `/locations/${countrySlug}` },
          { name: state.name, path: `/locations/${countrySlug}/${state.slug}` },
        ]}
      />
      <h1 className="font-heading text-3xl font-semibold sm:text-4xl">Photoshoot Locations in {state.name}</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Explore photoshoot locations in {state.name}, including{" "}
        {categories.map((c) => c.name.toLowerCase()).join(", ")} and other scenic spots.
      </p>

      {cities.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {cities.map((city) => (
            <Link
              key={city.slug}
              href={`/locations/${countrySlug}/${state.slug}/${city.slug}`}
              className="rounded-full border px-3 py-1 text-sm hover:bg-muted"
            >
              {city.name} ({city.count})
            </Link>
          ))}
        </div>
      )}

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
