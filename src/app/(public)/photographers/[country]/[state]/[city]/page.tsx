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

type Props = { params: Promise<{ country: string; state: string; city: string }> };

async function loadCity(countrySlug: string, stateSlug: string, citySlug: string) {
  const all = await getPublicPhotographers();
  const photographers = all.filter(
    (p) => p.country.slug === countrySlug && p.state.slug === stateSlug && p.citySlug === citySlug,
  );
  return photographers.length > 0
    ? { photographers, state: photographers[0].state, cityName: photographers[0].city }
    : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { country, state: stateSlug, city } = await params;
  const data = await loadCity(country, stateSlug, city);
  if (!data) return {};

  const { seo } = await getPhotographerGeoPage(country, stateSlug, city);
  const title = seo?.meta_title || `Pre-Wedding Photographers in ${data.cityName}`;
  const description = seo?.meta_description || `Find ${data.photographers.length} pre-wedding photographer${data.photographers.length === 1 ? "" : "s"} in ${data.cityName}, ${data.state.name}. Compare services, experience and starting prices.`;
  const path = `/photographers/${country}/${stateSlug}/${city}`;

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

export default async function PhotographersCityPage({ params }: Props) {
  const { country, state: stateSlug, city } = await params;
  const data = await loadCity(country, stateSlug, city);
  if (!data) notFound();

  const { photographers, state, cityName } = data;
  const { seo, blocks } = await getPhotographerGeoPage(country, stateSlug, city);

  return (
    <div>
      <PhotographersHero
        title={seo?.h1_title || `Pre-Wedding Photographers in ${cityName}`}
        imageUrl={seo?.image_url}
        subtitle={`${photographers.length} photographer${photographers.length === 1 ? "" : "s"} in ${cityName}, ${state.name}.`}
      />

      <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <PhotographerDirectory photographers={photographers} />
        <JsonLd data={buildItemListJsonLd(seo?.h1_title || `Pre-Wedding Photographers in ${cityName}`, photographers.slice(0, 100).map((p) => ({ name: p.studioName, path: `/photographers/p/${p.slug}` })))} />

        <div className="mt-10">
          <Breadcrumbs
            items={[
              { name: "Home", path: "/" },
              { name: "Photographers", path: "/photographers" },
              { name: state.name, path: `/photographers/${country}/${stateSlug}` },
              { name: cityName, path: `/photographers/${country}/${stateSlug}/${city}` },
            ]}
          />
        </div>

        <EditorialSection blocks={blocks} />
      </div>
    </div>
  );
}
