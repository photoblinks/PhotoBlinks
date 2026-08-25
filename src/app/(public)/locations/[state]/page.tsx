import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getActiveStates, getPublishedLocations } from "@/lib/public-data";
import { LocationCard } from "@/components/public/location-card";
import { Breadcrumbs } from "@/components/public/breadcrumbs";

type Props = { params: Promise<{ state: string }> };

const loadStatePage = cache(async (stateSlug: string) => {
  const states = await getActiveStates();
  const state = states.find((s) => s.slug === stateSlug);
  if (!state) return null;

  const locations = await getPublishedLocations({ stateId: state.id });
  if (locations.length === 0) return null;

  return { state, locations };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { state: stateSlug } = await params;
  const data = await loadStatePage(stateSlug);
  if (!data) return {};

  const title = `Photoshoot Locations in ${data.state.name}`;
  const description = `Explore photoshoot locations in ${data.state.name}, including beaches, temples, waterfalls, hills and other scenic spots.`;

  return {
    title,
    description,
    alternates: { canonical: `/locations/${data.state.slug}` },
    openGraph: {
      title: `${title} | PhotoBlinks`,
      description,
      url: `/locations/${data.state.slug}`,
      siteName: "PhotoBlinks",
      type: "website",
    },
  };
}

export default async function StateLocationsPage({ params }: Props) {
  const { state: stateSlug } = await params;
  const data = await loadStatePage(stateSlug);
  if (!data) notFound();

  const { state, locations } = data;

  const cityMap = new Map<string, { name: string; slug: string; count: number }>();
  // category slug -> { name, total count, city slug -> count in that city }
  const categoryMap = new Map<
    string,
    { name: string; slug: string; count: number; cityCounts: Map<string, number> }
  >();
  for (const location of locations) {
    if (location.city) {
      const existing = cityMap.get(location.city.slug);
      if (existing) existing.count += 1;
      else cityMap.set(location.city.slug, { ...location.city, count: 1 });
    }
    if (location.category && location.city) {
      const citySlug = location.city.slug;
      const existing = categoryMap.get(location.category.slug);
      if (existing) {
        existing.count += 1;
        existing.cityCounts.set(citySlug, (existing.cityCounts.get(citySlug) ?? 0) + 1);
      } else {
        categoryMap.set(location.category.slug, {
          ...location.category,
          count: 1,
          cityCounts: new Map([[citySlug, 1]]),
        });
      }
    }
  }
  const cities = [...cityMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  // Link each category to whichever city in this state has the most
  // locations in it, so the link always resolves to a real page.
  const categories = [...categoryMap.values()]
    .map((category) => {
      const [bestCity] = [...category.cityCounts.entries()].sort((a, b) => b[1] - a[1]);
      return { ...category, citySlug: bestCity[0] };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Breadcrumbs
        items={[
          { name: "Home", path: "/" },
          { name: "Locations", path: "/locations" },
          { name: state.name, path: `/locations/${state.slug}` },
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
              href={`/locations/${state.slug}/${city.slug}`}
              className="rounded-full border px-3 py-1 text-sm hover:bg-muted"
            >
              {city.name} ({city.count})
            </Link>
          ))}
        </div>
      )}

      {categories.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {categories.map((category) => (
            <Link
              key={category.slug}
              href={`/locations/${state.slug}/${category.citySlug}/${category.slug}`}
              className="text-sm text-muted-foreground hover:text-foreground hover:underline"
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
