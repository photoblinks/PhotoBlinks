import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import {
  getActiveCities,
  getActiveStates,
  getCategoryBySlug,
  getPublishedLocations,
} from "@/lib/public-data";
import { HomeFilter } from "@/components/public/home-filter";
import { LocationCard } from "@/components/public/location-card";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { JsonLd } from "@/components/public/json-ld";
import { DEFAULT_OG_IMAGE, buildItemListJsonLd } from "@/lib/jsonld";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ state?: string; city?: string; pricing?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return {};

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
      images: [category.image_url ?? DEFAULT_OG_IMAGE],
    },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const query = await searchParams;
  const [states, cities] = await Promise.all([getActiveStates(), getActiveCities()]);

  const selectedState = states.find((s) => s.slug === query.state);
  const selectedCity = cities.find((c) => c.slug === query.city);
  const pricingType =
    query.pricing === "free" || query.pricing === "paid" || query.pricing === "unknown"
      ? query.pricing
      : undefined;

  const locations = await getPublishedLocations({
    categoryId: category.id,
    stateId: selectedState?.id,
    cityId: selectedCity?.id,
    pricingType,
  });

  const heading = category.h1_title || `${category.name} Pre-Wedding Photoshoot Locations`;

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

      <div className="relative z-10 mx-auto -mt-8 max-w-6xl px-4 sm:-mt-10 sm:px-6">
        <HomeFilter
          states={states}
          cities={cities}
          categories={[]}
          hideCategory
          basePath={`/category/${category.slug}`}
          initial={{ state: query.state, city: query.city, pricing: query.pricing }}
        />
      </div>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <Breadcrumbs
          items={[
            { name: "Home", path: "/" },
            { name: "Locations", path: "/locations" },
            { name: category.name, path: `/category/${category.slug}` },
          ]}
        />

        {category.description && (
          <p className="mb-6 max-w-2xl text-muted-foreground">{category.description}</p>
        )}

        <h2 className="font-heading mb-6 text-xl font-semibold">
          {locations.length} location{locations.length === 1 ? "" : "s"} found
        </h2>

        {locations.length === 0 ? (
          <p className="text-muted-foreground">
            No published {category.name.toLowerCase()} locations match these filters yet. Try a
            different combination.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
            {locations.map((location) => (
              <LocationCard key={location.id} location={location} />
            ))}
          </div>
        )}
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
