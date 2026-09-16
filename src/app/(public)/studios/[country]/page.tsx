import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getActiveCountries, getPublishedStudios } from "@/lib/public-data";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { StudioSearch } from "@/components/public/studio-search";
import { DEFAULT_OG_IMAGE } from "@/lib/jsonld";
import { hasIndexAffectingParams } from "@/lib/seo-eligibility";

type Props = {
  params: Promise<{ country: string }>;
  // Reading searchParams makes this route dynamic instead of ISR — the same
  // tradeoff already accepted on the location directory pages.
  searchParams: Promise<{ q?: string }>;
};

const loadCountryPage = cache(async (countrySlug: string) => {
  const countries = await getActiveCountries();
  const country = countries.find((c) => c.slug === countrySlug);
  if (!country) return null;

  const studios = await getPublishedStudios({ countryId: country.id });
  if (studios.length === 0) return null;

  return { country, studios };
});

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { country: countrySlug } = await params;
  const query = await searchParams;
  const data = await loadCountryPage(countrySlug);
  if (!data) return {};

  const title = `Pre-Wedding Photo Studios in ${data.country.name}`;
  const description = `Browse pre-wedding photo studios in ${data.country.name} by state.`;

  return {
    title,
    description,
    alternates: { canonical: `/studios/${data.country.slug}` },
    openGraph: {
      title: `${title} | PhotoBlinks`,
      description,
      url: `/studios/${data.country.slug}`,
      siteName: "PhotoBlinks",
      type: "website",
      images: [DEFAULT_OG_IMAGE],
    },
    // The "?q=" search variant is noindexed since it canonicalizes to this
    // same clean URL and isn't meant to be its own landing page.
    ...(hasIndexAffectingParams(query) ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function CountryStudiosPage({ params, searchParams }: Props) {
  const { country: countrySlug } = await params;
  const data = await loadCountryPage(countrySlug);
  if (!data) notFound();

  const { country, studios: allStudios } = data;
  const { q } = await searchParams;
  const search = q?.trim().toLowerCase();
  const studios = search
    ? allStudios.filter((s) => s.name.toLowerCase().includes(search))
    : allStudios;

  const stateCounts = new Map<string, { name: string; slug: string; count: number }>();
  for (const studio of studios) {
    if (!studio.state) continue;
    const existing = stateCounts.get(studio.state.slug);
    if (existing) existing.count += 1;
    else stateCounts.set(studio.state.slug, { ...studio.state, count: 1 });
  }
  const states = [...stateCounts.values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Breadcrumbs
        items={[
          { name: "Home", path: "/" },
          { name: "Studios", path: "/studios" },
          { name: country.name, path: `/studios/${country.slug}` },
        ]}
      />
      <h1 className="font-heading text-3xl font-semibold sm:text-4xl">
        Pre-Wedding Photo Studios in {country.name}
      </h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Explore pre-wedding photo studios in {country.name} by state.
      </p>

      <StudioSearch basePath={`/studios/${country.slug}`} q={q} />

      {states.length === 0 ? (
        <p className="mt-8 text-muted-foreground">
          No published studios match &ldquo;{q}&rdquo;. Try a different search.
        </p>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {states.map((state) => (
            <Link
              key={state.slug}
              href={`/studios/${country.slug}/${state.slug}${search ? `?q=${encodeURIComponent(q!)}` : ""}`}
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
