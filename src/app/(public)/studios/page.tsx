import Link from "next/link";
import type { Metadata } from "next";
import { getPublishedStudios } from "@/lib/public-data";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { DEFAULT_OG_IMAGE } from "@/lib/jsonld";

export const metadata: Metadata = {
  title: "Photography Studios by State",
  description: "Browse published PhotoBlinks photography studios across Karnataka, Kerala, and more.",
  alternates: { canonical: "/studios" },
  openGraph: {
    title: "Photography Studios by State | PhotoBlinks",
    description: "Browse published PhotoBlinks photography studios across Karnataka, Kerala, and more.",
    url: "/studios",
    siteName: "PhotoBlinks",
    type: "website",
    images: [DEFAULT_OG_IMAGE],
  },
};

export default async function StudiosIndexPage() {
  const studios = await getPublishedStudios();

  const stateCounts = new Map<string, { name: string; slug: string; count: number }>();
  for (const studio of studios) {
    if (!studio.state) continue;
    const existing = stateCounts.get(studio.state.slug);
    if (existing) existing.count += 1;
    else stateCounts.set(studio.state.slug, { ...studio.state, count: 1 });
  }
  const states = [...stateCounts.values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: "Studios", path: "/studios" }]} />
      <h1 className="font-heading text-3xl font-semibold sm:text-4xl">Photography Studios</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Explore real, published PhotoBlinks photography studios by state across Karnataka and
        Kerala.
      </p>

      {states.length === 0 ? (
        <p className="mt-8 text-muted-foreground">No published studios yet — check back soon.</p>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {states.map((state) => (
            <Link
              key={state.slug}
              href={`/studios/${state.slug}`}
              className="rounded-lg border p-4 transition-shadow hover:shadow-md"
            >
              <h2 className="text-lg font-semibold">{state.name}</h2>
              <p className="text-sm text-muted-foreground">
                {state.count} studio{state.count === 1 ? "" : "s"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
