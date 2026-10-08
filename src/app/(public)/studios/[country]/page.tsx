import { Suspense, cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getActiveCountries, getPublishedStudios } from "@/lib/public-data";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { StudioSearch } from "@/components/public/studio-search";
import { StudioDirectory, CountryStudioResults } from "@/components/public/studio-directory";
import { DEFAULT_OG_IMAGE } from "@/lib/jsonld";

// ISR: no searchParams/cookies read, so the route is eligible for the Full
// Route Cache with the same 60s window as public-data.ts. The ?q= name
// search now runs client-side (StudioDirectory).
export const revalidate = 60;

export async function generateStaticParams() {
  return [];
}

type Props = {
  params: Promise<{ country: string }>;
};

const loadCountryPage = cache(async (countrySlug: string) => {
  const countries = await getActiveCountries();
  const country = countries.find((c) => c.slug === countrySlug);
  if (!country) return null;

  const studios = await getPublishedStudios({ countryId: country.id });
  if (studios.length === 0) return null;

  return { country, studios };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { country: countrySlug } = await params;
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
  };
}

export default async function CountryStudiosPage({ params }: Props) {
  const { country: countrySlug } = await params;
  const data = await loadCountryPage(countrySlug);
  if (!data) notFound();

  const { country, studios } = data;
  const basePath = `/studios/${country.slug}`;

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

      <Suspense
        fallback={
          <>
            <StudioSearch basePath={basePath} />
            <CountryStudioResults studios={studios} countrySlug={country.slug} />
          </>
        }
      >
        <StudioDirectory mode="country" studios={studios} basePath={basePath} countrySlug={country.slug} />
      </Suspense>
    </div>
  );
}
