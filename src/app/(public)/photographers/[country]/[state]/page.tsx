import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPhotographerGeoPage, getPublicPhotographers } from "@/lib/public-data";
import { EditorialSection } from "@/components/public/editorial-section";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { PhotographersHero } from "@/components/public/photographers-hero";
import { PhotographerDirectory } from "@/components/public/photographer-directory";
import { JsonLd } from "@/components/public/json-ld";
import { DEFAULT_OG_IMAGE, buildItemListJsonLd } from "@/lib/jsonld";

export const revalidate = 604800;

export async function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ country: string; state: string }> };

async function loadState(countrySlug: string, stateSlug: string) {
  const all = await getPublicPhotographers();
  const photographers = all.filter((p) => p.country.slug === countrySlug && p.state.slug === stateSlug);
  return photographers.length > 0 ? { photographers, state: photographers[0].state } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { country, state: stateSlug } = await params;
  const data = await loadState(country, stateSlug);
  if (!data) return {};

  const { seo } = await getPhotographerGeoPage(country, stateSlug, null);
  const title = seo?.meta_title || `Pre-Wedding Photographers in ${data.state.name}`;
  const description = seo?.meta_description || `Browse ${data.photographers.length} pre-wedding photographer${data.photographers.length === 1 ? "" : "s"} in ${data.state.name}. Compare services, experience and starting prices.`;
  const path = `/photographers/${country}/${stateSlug}`;

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

export default async function PhotographersStatePage({ params }: Props) {
  const { country, state: stateSlug } = await params;
  const data = await loadState(country, stateSlug);
  if (!data) notFound();

  const { photographers, state } = data;
  const { seo, blocks } = await getPhotographerGeoPage(country, stateSlug, null);
  const cities = new Map<string, { name: string; slug: string; count: number }>();
  for (const p of photographers) {
    const entry = cities.get(p.citySlug);
    if (entry) entry.count += 1;
    else cities.set(p.citySlug, { name: p.city, slug: p.citySlug, count: 1 });
  }
  const cityLinks = [...cities.values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <PhotographersHero
        title={seo?.h1_title || `Pre-Wedding Photographers in ${state.name}`}
        imageUrl={seo?.image_url}
        subtitle={`${photographers.length} photographer${photographers.length === 1 ? "" : "s"} across ${cityLinks.length} cit${cityLinks.length === 1 ? "y" : "ies"} in ${state.name}.`}
      />

      <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <PhotographerDirectory photographers={photographers} />
        <JsonLd data={buildItemListJsonLd(seo?.h1_title || `Pre-Wedding Photographers in ${state.name}`, photographers.slice(0, 100).map((p) => ({ name: p.studioName, path: `/photographers/p/${p.slug}` })))} />

        <div className="mt-10">
          <Breadcrumbs
            items={[
              { name: "Home", path: "/" },
              { name: "Photographers", path: "/photographers" },
              { name: state.name, path: `/photographers/${country}/${stateSlug}` },
            ]}
          />
        </div>

        {cityLinks.length > 0 && (
          <div className="mt-8 border-t pt-8">
            <h2 className="font-heading mb-3 text-xl font-semibold">Browse by city</h2>
            <div className="flex flex-wrap gap-2">
              {cityLinks.map((city) => (
                <Link
                  key={city.slug}
                  href={`/photographers/${country}/${stateSlug}/${city.slug}`}
                  className="rounded-full border px-4 py-1.5 text-sm hover:bg-muted"
                >
                  {city.name} ({city.count})
                </Link>
              ))}
            </div>
          </div>
        )}

        <EditorialSection blocks={blocks} />
      </div>
    </div>
  );
}
