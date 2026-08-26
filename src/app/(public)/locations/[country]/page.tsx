import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getActiveCountries, getPublishedLocations } from "@/lib/public-data";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { DEFAULT_OG_IMAGE } from "@/lib/jsonld";

type Props = { params: Promise<{ country: string }> };

const loadCountryPage = cache(async (countrySlug: string) => {
  const countries = await getActiveCountries();
  const country = countries.find((c) => c.slug === countrySlug);
  if (!country) return null;

  const locations = await getPublishedLocations({ countryId: country.id });
  if (locations.length === 0) return null;

  return { country, locations };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { country: countrySlug } = await params;
  const data = await loadCountryPage(countrySlug);
  if (!data) return {};

  const title = `Photoshoot Locations in ${data.country.name}`;
  const description = `Explore photoshoot locations in ${data.country.name} by state.`;

  return {
    title,
    description,
    alternates: { canonical: `/locations/${data.country.slug}` },
    openGraph: {
      title: `${title} | PhotoBlinks`,
      description,
      url: `/locations/${data.country.slug}`,
      siteName: "PhotoBlinks",
      type: "website",
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

export default async function CountryLocationsPage({ params }: Props) {
  const { country: countrySlug } = await params;
  const data = await loadCountryPage(countrySlug);
  if (!data) notFound();

  const { country, locations } = data;

  const stateCounts = new Map<string, { name: string; slug: string; count: number }>();
  for (const location of locations) {
    if (!location.state) continue;
    const existing = stateCounts.get(location.state.slug);
    if (existing) existing.count += 1;
    else stateCounts.set(location.state.slug, { ...location.state, count: 1 });
  }
  const states = [...stateCounts.values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Breadcrumbs
        items={[
          { name: "Home", path: "/" },
          { name: "Locations", path: "/locations" },
          { name: country.name, path: `/locations/${country.slug}` },
        ]}
      />
      <h1 className="font-heading text-3xl font-semibold sm:text-4xl">
        Photoshoot Locations in {country.name}
      </h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Explore photoshoot locations in {country.name} by state — beaches, waterfalls, temples,
        hills, and more.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {states.map((state) => (
          <Link
            key={state.slug}
            href={`/locations/${country.slug}/${state.slug}`}
            className="rounded-lg border p-4 transition-shadow hover:shadow-md"
          >
            <h2 className="text-lg font-semibold">{state.name}</h2>
            <p className="text-sm text-muted-foreground">
              {state.count} location{state.count === 1 ? "" : "s"}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
