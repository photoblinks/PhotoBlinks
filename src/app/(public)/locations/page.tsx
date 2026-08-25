import Link from "next/link";
import type { Metadata } from "next";
import { getPublishedLocations } from "@/lib/public-data";
import { Breadcrumbs } from "@/components/public/breadcrumbs";

export const metadata: Metadata = {
  title: "Photoshoot Locations by State",
  description: "Browse PhotoBlinks photoshoot locations across Karnataka, Kerala, and more.",
  alternates: { canonical: "/locations" },
  openGraph: {
    title: "Photoshoot Locations by State | PhotoBlinks",
    description: "Browse PhotoBlinks photoshoot locations across Karnataka, Kerala, and more.",
    url: "/locations",
    siteName: "PhotoBlinks",
    type: "website",
  },
};

export default async function LocationsIndexPage() {
  const locations = await getPublishedLocations();

  const stateCounts = new Map<string, { name: string; slug: string; count: number }>();
  for (const location of locations) {
    if (!location.state) continue;
    const existing = stateCounts.get(location.state.slug);
    if (existing) {
      existing.count += 1;
    } else {
      stateCounts.set(location.state.slug, { ...location.state, count: 1 });
    }
  }
  const states = [...stateCounts.values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: "Locations", path: "/locations" }]} />
      <h1 className="font-heading text-3xl font-semibold sm:text-4xl">Photoshoot Locations</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Explore real, published PhotoBlinks photoshoot locations by state — beaches, waterfalls,
        temples, hills, and more across Karnataka and Kerala.
      </p>

      {states.length === 0 ? (
        <p className="mt-8 text-muted-foreground">No published locations yet — check back soon.</p>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {states.map((state) => (
            <Link
              key={state.slug}
              href={`/locations/${state.slug}`}
              className="rounded-lg border p-4 transition-shadow hover:shadow-md"
            >
              <h2 className="text-lg font-semibold">{state.name}</h2>
              <p className="text-sm text-muted-foreground">
                {state.count} location{state.count === 1 ? "" : "s"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
