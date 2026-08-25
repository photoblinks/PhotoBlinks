import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getActiveStates, getPublishedStudios } from "@/lib/public-data";
import { StudioCard } from "@/components/public/studio-card";
import { Breadcrumbs } from "@/components/public/breadcrumbs";

type Props = { params: Promise<{ state: string }> };

const loadStatePage = cache(async (stateSlug: string) => {
  const states = await getActiveStates();
  const state = states.find((s) => s.slug === stateSlug);
  if (!state) return null;

  const studios = await getPublishedStudios({ stateId: state.id });
  if (studios.length === 0) return null;

  return { state, studios };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { state: stateSlug } = await params;
  const data = await loadStatePage(stateSlug);
  if (!data) return {};

  const title = `Photography Studios in ${data.state.name}`;
  const description = `Browse photography studios in ${data.state.name} for indoor and preset photoshoots.`;

  return {
    title,
    description,
    alternates: { canonical: `/studios/${data.state.slug}` },
    openGraph: {
      title: `${title} | PhotoBlinks`,
      description,
      url: `/studios/${data.state.slug}`,
      siteName: "PhotoBlinks",
      type: "website",
    },
  };
}

export default async function StateStudiosPage({ params }: Props) {
  const { state: stateSlug } = await params;
  const data = await loadStatePage(stateSlug);
  if (!data) notFound();

  const { state, studios } = data;

  const cityMap = new Map<string, { name: string; slug: string; count: number }>();
  for (const studio of studios) {
    if (!studio.city) continue;
    const existing = cityMap.get(studio.city.slug);
    if (existing) existing.count += 1;
    else cityMap.set(studio.city.slug, { ...studio.city, count: 1 });
  }
  const cities = [...cityMap.values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Breadcrumbs
        items={[
          { name: "Home", path: "/" },
          { name: "Studios", path: "/studios" },
          { name: state.name, path: `/studios/${state.slug}` },
        ]}
      />
      <h1 className="text-3xl font-semibold">Photography Studios in {state.name}</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Browse photography studios in {state.name} for indoor and preset photoshoots.
      </p>

      {cities.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {cities.map((city) => (
            <Link
              key={city.slug}
              href={`/studios/${state.slug}/${city.slug}`}
              className="rounded-full border px-3 py-1 text-sm hover:bg-muted"
            >
              {city.name} ({city.count})
            </Link>
          ))}
        </div>
      )}

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {studios.map((studio) => (
          <StudioCard key={studio.id} studio={studio} />
        ))}
      </div>
    </div>
  );
}
