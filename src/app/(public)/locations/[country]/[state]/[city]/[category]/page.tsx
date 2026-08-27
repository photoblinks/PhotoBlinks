import { cache } from "react";
import Link from "next/link";
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

type Props = { params: Promise<{ country: string; state: string; city: string; category: string }> };

// No searchParams/cookies here, so this route is eligible for ISR — the
// same 60s window as the underlying cached data queries (public-data.ts).
// generateStaticParams is required (even empty) for a dynamic segment to
// use ISR at all — see the matching comment in location/[slug]/page.tsx.
export const revalidate = 60;

export async function generateStaticParams() {
  return [];
}

const loadCategoryPage = cache(
  async (countrySlug: string, stateSlug: string, citySlug: string, categorySlug: string) => {
    const states = await getActiveStates();
    const state = states.find((s) => s.slug === stateSlug && s.country?.slug === countrySlug);
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
  },
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { country: countrySlug, state: stateSlug, city: citySlug, category: categorySlug } = await params;
  const data = await loadCategoryPage(countrySlug, stateSlug, citySlug, categorySlug);
  if (!data) return {};

  const title = `${data.category.name} Pre-Wedding Photoshoot Locations in ${data.city.name}`;
  const description = `Browse ${data.category.name.toLowerCase()} pre-wedding photoshoot locations in ${data.city.name}, ${data.state.name}.`;
  const path = `/locations/${countrySlug}/${data.state.slug}/${data.city.slug}/${data.category.slug}`;

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
  const { country: countrySlug, state: stateSlug, city: citySlug, category: categorySlug } = await params;
  const data = await loadCategoryPage(countrySlug, stateSlug, citySlug, categorySlug);
  if (!data) notFound();

  const { state, city, category, locations } = data;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Breadcrumbs
        items={[
          { name: "Home", path: "/" },
          { name: "Locations", path: "/locations" },
          { name: state.country!.name, path: `/locations/${countrySlug}` },
          { name: state.name, path: `/locations/${countrySlug}/${state.slug}` },
          { name: city.name, path: `/locations/${countrySlug}/${state.slug}/${city.slug}` },
          {
            name: category.name,
            path: `/locations/${countrySlug}/${state.slug}/${city.slug}/${category.slug}`,
          },
        ]}
      />
      <h1 className="font-heading text-3xl font-semibold sm:text-4xl">
        {category.name} Pre-Wedding Photoshoot Locations in {city.name}
      </h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Browse {category.name.toLowerCase()} pre-wedding photoshoot locations in {city.name}, {state.name}.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {locations.map((location) => (
          <LocationCard key={location.id} location={location} />
        ))}
      </div>

      <div className="mt-10 border-t pt-6">
        <h2 className="font-heading mb-3 text-xl font-semibold">Explore More Locations</h2>
        <ul className="flex flex-col gap-2 text-sm">
          <li>
            <Link
              href={`/locations/${countrySlug}/${state.slug}/${city.slug}`}
              className="font-medium text-pb-brand hover:underline"
            >
              All pre-wedding photoshoot locations in {city.name}
            </Link>
          </li>
          <li>
            <Link
              href={`/locations/${countrySlug}/${state.slug}`}
              className="font-medium text-pb-brand hover:underline"
            >
              All pre-wedding photoshoot locations in {state.name}
            </Link>
          </li>
        </ul>
      </div>

      <JsonLd
        data={buildItemListJsonLd(
          `${category.name} Pre-Wedding Photoshoot Locations in ${city.name}`,
          locations.map((l) => ({ name: l.name, path: `/location/${l.slug}` })),
        )}
      />
    </div>
  );
}
