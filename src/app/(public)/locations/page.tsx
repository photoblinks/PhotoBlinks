import Link from "next/link";
import type { Metadata } from "next";
import { getActiveCountries, getPublishedLocations } from "@/lib/public-data";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { DEFAULT_OG_IMAGE } from "@/lib/jsonld";

export const metadata: Metadata = {
  title: "Photoshoot Locations by Country",
  description: "Browse PhotoBlinks photoshoot locations by country.",
  alternates: { canonical: "/locations" },
  openGraph: {
    title: "Photoshoot Locations by Country | PhotoBlinks",
    description: "Browse PhotoBlinks photoshoot locations by country.",
    url: "/locations",
    siteName: "PhotoBlinks",
    type: "website",
    images: [DEFAULT_OG_IMAGE],
  },
};

export default async function LocationsIndexPage() {
  const [countries, locations] = await Promise.all([getActiveCountries(), getPublishedLocations()]);

  const countryCounts = new Map<string, number>();
  for (const location of locations) {
    if (!location.country) continue;
    countryCounts.set(location.country.slug, (countryCounts.get(location.country.slug) ?? 0) + 1);
  }
  const activeCountries = countries.filter((c) => (countryCounts.get(c.slug) ?? 0) > 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: "Locations", path: "/locations" }]} />
      <h1 className="font-heading text-3xl font-semibold sm:text-4xl">Photoshoot Locations</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Explore real, published PhotoBlinks photoshoot locations by country — beaches, waterfalls,
        temples, hills, and more.
      </p>

      {activeCountries.length === 0 ? (
        <p className="mt-8 text-muted-foreground">No published locations yet — check back soon.</p>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {activeCountries.map((country) => {
            const count = countryCounts.get(country.slug) ?? 0;
            return (
              <Link
                key={country.slug}
                href={`/locations/${country.slug}`}
                className="rounded-lg border p-4 transition-shadow hover:shadow-md"
              >
                <h2 className="text-lg font-semibold">{country.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {count} location{count === 1 ? "" : "s"}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
