import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getActiveCategories,
  getActiveCities,
  getActiveStates,
  getPublishedLocations,
} from "@/lib/public-data";
import { LocationCard } from "@/components/public/location-card";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { JsonLd } from "@/components/public/json-ld";
import { DEFAULT_OG_IMAGE, buildItemListJsonLd } from "@/lib/jsonld";

type Props = { params: Promise<{ state: string; city: string; category: string }> };

const loadCategoryPage = cache(async (stateSlug: string, citySlug: string, categorySlug: string) => {
  const states = await getActiveStates();
  const state = states.find((s) => s.slug === stateSlug);
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

  return { state, city, category, locations };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { state: stateSlug, city: citySlug, category: categorySlug } = await params;
  const data = await loadCategoryPage(stateSlug, citySlug, categorySlug);
  if (!data) return {};

  const title = `${data.category.name} Photoshoot Locations in ${data.city.name}`;
  const description = `Browse ${data.category.name.toLowerCase()} photoshoot locations in ${data.city.name}, ${data.state.name}.`;
  const path = `/locations/${data.state.slug}/${data.city.slug}/${data.category.slug}`;

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

export default async function CategoryLocationsPage({ params }: Props) {
  const { state: stateSlug, city: citySlug, category: categorySlug } = await params;
  const data = await loadCategoryPage(stateSlug, citySlug, categorySlug);
  if (!data) notFound();

  const { state, city, category, locations } = data;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Breadcrumbs
        items={[
          { name: "Home", path: "/" },
          { name: "Locations", path: "/locations" },
          { name: state.name, path: `/locations/${state.slug}` },
          { name: city.name, path: `/locations/${state.slug}/${city.slug}` },
          {
            name: category.name,
            path: `/locations/${state.slug}/${city.slug}/${category.slug}`,
          },
        ]}
      />
      <h1 className="font-heading text-3xl font-semibold sm:text-4xl">
        {category.name} Photoshoot Locations in {city.name}
      </h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Browse {category.name.toLowerCase()} photoshoot locations in {city.name}, {state.name}.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {locations.map((location) => (
          <LocationCard key={location.id} location={location} />
        ))}
      </div>

      <JsonLd
        data={buildItemListJsonLd(
          `${category.name} Photoshoot Locations in ${city.name}`,
          locations.map((l) => ({ name: l.name, path: `/location/${l.slug}` })),
        )}
      />
    </div>
  );
}
