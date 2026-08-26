import Link from "next/link";
import type { Metadata } from "next";
import { getActiveCountries, getPublishedStudios } from "@/lib/public-data";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { DEFAULT_OG_IMAGE } from "@/lib/jsonld";

export const metadata: Metadata = {
  title: "Photography Studios by Country",
  description: "Browse published PhotoBlinks photography studios by country.",
  alternates: { canonical: "/studios" },
  openGraph: {
    title: "Photography Studios by Country | PhotoBlinks",
    description: "Browse published PhotoBlinks photography studios by country.",
    url: "/studios",
    siteName: "PhotoBlinks",
    type: "website",
    images: [DEFAULT_OG_IMAGE],
  },
};

export default async function StudiosIndexPage() {
  const [countries, studios] = await Promise.all([getActiveCountries(), getPublishedStudios()]);

  const countryCounts = new Map<string, number>();
  for (const studio of studios) {
    if (!studio.country) continue;
    countryCounts.set(studio.country.slug, (countryCounts.get(studio.country.slug) ?? 0) + 1);
  }
  const activeCountries = countries.filter((c) => (countryCounts.get(c.slug) ?? 0) > 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: "Studios", path: "/studios" }]} />
      <h1 className="font-heading text-3xl font-semibold sm:text-4xl">Photography Studios</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Explore real, published PhotoBlinks photography studios by country.
      </p>

      {activeCountries.length === 0 ? (
        <p className="mt-8 text-muted-foreground">No published studios yet — check back soon.</p>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {activeCountries.map((country) => {
            const count = countryCounts.get(country.slug) ?? 0;
            return (
              <Link
                key={country.slug}
                href={`/studios/${country.slug}`}
                className="rounded-lg border p-4 transition-shadow hover:shadow-md"
              >
                <h2 className="text-lg font-semibold">{country.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {count} studio{count === 1 ? "" : "s"}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
