import { Suspense } from "react";
import { notFound } from "next/navigation";
import Image from "next/image";
import type { Metadata } from "next";
import {
  getActiveCities,
  getActiveStates,
  getCategoryBySlug,
  getPublishedLocations,
} from "@/lib/public-data";
import { HomeFilter } from "@/components/public/home-filter";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { DirectoryFilter, DirectoryResults } from "@/components/public/location-directory";
import { CategoryExploreByState, FlatBrowse } from "@/components/public/location-browse-views";
import { JsonLd } from "@/components/public/json-ld";
import { DEFAULT_OG_IMAGE, buildItemListJsonLd, socialImageUrl } from "@/lib/jsonld";
import { isSeoEligible } from "@/lib/seo-eligibility";

// ISR: no searchParams/cookies read, so the route is eligible for the Full
// Route Cache with the same 60s window as public-data.ts. Filtering and
// pagination run client-side.
export const revalidate = 60;

export async function generateStaticParams() {
  return [];
}

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return {};

  // Eligibility must reflect the canonical (nationwide, unfiltered) dataset
  // regardless of any ?state=/?city=/?pricing= query.
  const locations = await getPublishedLocations({ categoryId: category.id });

  const title = category.meta_title || `${category.name} Pre-Wedding Photoshoot Locations in India`;
  const description =
    category.meta_description ||
    category.description ||
    `Browse ${category.name.toLowerCase()} pre-wedding photoshoot locations across India and filter by state, city, and budget.`;
  const path = `/category/${category.slug}`;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      siteName: "PhotoBlinks",
      type: "website",
      images: [category.image_url ? socialImageUrl(category.image_url) : DEFAULT_OG_IMAGE],
    },
    // Below the SEO eligibility threshold the page still renders for
    // product/UX purposes but shouldn't be indexed — see seo-eligibility.ts.
    ...(isSeoEligible(locations.length)
      ? {}
      : { robots: { index: false, follow: true } }),
  };
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const [states, cities, locations] = await Promise.all([
    getActiveStates(),
    getActiveCities(),
    getPublishedLocations({ categoryId: category.id }),
  ]);

  const heading = category.h1_title || `${category.name} Pre-Wedding Photoshoot Locations`;
  const listingHeading = `${locations.length} location${locations.length === 1 ? "" : "s"} found`;
  const breadcrumbs = [
    { name: "Home", path: "/" },
    { name: "Locations", path: "/locations" },
    { name: category.name, path: `/category/${category.slug}` },
  ];
  const basePath = `/category/${category.slug}`;
  const fixedCategory = { name: category.name, slug: category.slug };

  return (
    <div>
      <section className="relative h-[420px] overflow-hidden sm:h-[480px]">
        {category.image_url ? (
          <Image
            src={category.image_url}
            alt={category.name}
            fill
            priority
            className="object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-linear-to-br from-emerald-950 via-pb-brand to-emerald-800"
          />
        )}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-linear-to-t from-black/60 via-black/10 to-transparent"
        />
        <div className="absolute inset-x-0 bottom-16 px-4 text-center sm:bottom-20 sm:px-6">
          <h1 className="font-heading text-3xl font-semibold text-white sm:text-4xl">{heading}</h1>
        </div>
      </section>

      <div className="relative z-10 mx-auto -mt-8 max-w-7xl px-4 sm:-mt-10 sm:px-6">
        <Suspense
          fallback={
            <HomeFilter
              states={states}
              cities={cities}
              categories={[]}
              hideCategory
              basePath={basePath}
              initial={{}}
            />
          }
        >
          <DirectoryFilter
            mode="category"
            states={states}
            cities={cities}
            categories={[]}
            basePath={basePath}
          />
        </Suspense>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <Breadcrumbs items={breadcrumbs} />

        {category.description && (
          <p className="mb-6 max-w-2xl text-muted-foreground">{category.description}</p>
        )}

        <Suspense
          fallback={
            <>
              <FlatBrowse
                heading={listingHeading}
                locations={locations}
                page={undefined}
                basePath={basePath}
                query={{}}
              />
              <CategoryExploreByState category={fixedCategory} locations={locations} />
            </>
          }
        >
          <DirectoryResults
            mode="category"
            locations={locations}
            states={states}
            cities={cities}
            categories={[]}
            basePath={basePath}
            fixedCategory={fixedCategory}
            heading={listingHeading}
          />
        </Suspense>
      </div>

      <JsonLd
        data={buildItemListJsonLd(
          heading,
          locations.map((l) => ({ name: l.name, path: `/location/${l.slug}` })),
        )}
      />
    </div>
  );
}
