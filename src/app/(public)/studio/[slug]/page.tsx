import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Tag, Navigation } from "lucide-react";
import { getPublishedStudioBySlug } from "@/lib/public-data";
import { ImageGallery } from "@/components/public/image-gallery";
import { ShareButton } from "@/components/public/share-button";
import { YouTubeEmbed } from "@/components/public/youtube-embed";
import { MiniMap } from "@/components/public/mini-map";
import { DistanceDisplay } from "@/components/public/distance-display";
import { GoToLocationButton } from "@/components/public/go-to-location-button";
import { ActionButton } from "@/components/public/action-button";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { ExtraDetailsList, hasExtraDetails } from "@/components/public/extra-details-list";
import { JsonLd } from "@/components/public/json-ld";
import { absoluteUrl, buildLocalBusinessJsonLd } from "@/lib/jsonld";

type Props = { params: Promise<{ slug: string }> };

// No searchParams/cookies here, so this route is eligible for ISR — the
// same 60s window as the underlying cached data queries (public-data.ts).
// generateStaticParams is required (even empty) for a dynamic segment to
// use ISR at all — see the matching comment in location/[slug]/page.tsx.
export const revalidate = 60;

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const studio = await getPublishedStudioBySlug(slug);
  if (!studio) return {};

  const place = [studio.city?.name, studio.state?.name].filter(Boolean).join(", ");
  const title =
    studio.meta_title || `${studio.name} - Pre-Wedding Photo Studio in ${studio.city?.name ?? place}`;
  const description =
    studio.meta_description ||
    studio.description ||
    `${studio.name}, a pre-wedding photo studio in ${place}.`;

  return {
    title,
    description,
    alternates: { canonical: `/studio/${studio.slug}` },
    openGraph: {
      title,
      description,
      url: `/studio/${studio.slug}`,
      siteName: "PhotoBlinks",
      type: "website",
      images: studio.images[0] ? [studio.images[0]] : undefined,
    },
  };
}

export default async function StudioDetailPage({ params }: Props) {
  const { slug } = await params;
  const studio = await getPublishedStudioBySlug(slug);
  if (!studio) notFound();

  const hasCoords = studio.latitude != null && studio.longitude != null;

  const breadcrumbItems = [
    { name: "Home", path: "/" },
    { name: "Studios", path: "/studios" },
    ...(studio.country ? [{ name: studio.country.name, path: `/studios/${studio.country.slug}` }] : []),
    ...(studio.country && studio.state
      ? [{ name: studio.state.name, path: `/studios/${studio.country.slug}/${studio.state.slug}` }]
      : []),
    ...(studio.country && studio.state && studio.city
      ? [
          {
            name: studio.city.name,
            path: `/studios/${studio.country.slug}/${studio.state.slug}/${studio.city.slug}`,
          },
        ]
      : []),
  ];

  // "India, Karnataka, Bangalore" — shown under the studio name in place of
  // a separate Country/State/City list.
  const subtitle = [studio.country?.name, studio.state?.name, studio.city?.name]
    .filter(Boolean)
    .join(", ");

  const imageAlt = studio.city ? `${studio.name} in ${studio.city.name}` : studio.name;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={breadcrumbItems} />
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold sm:text-4xl">{studio.name}</h1>
          {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
        </div>
        <ShareButton title={studio.name} url={absoluteUrl(`/studio/${studio.slug}`)} />
      </div>

      <ImageGallery images={studio.images} alt={imageAlt} />

      <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {hasExtraDetails(studio) && (
            <>
              <h2 className="font-heading mb-4 text-xl font-semibold">About This Studio</h2>
              <ExtraDetailsList details={studio} />
            </>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
              <span className="flex size-7 items-center justify-center rounded-full bg-pb-brand/10">
                <Tag className="size-3.5 text-pb-brand" />
              </span>
              Pricing
            </h2>
            {studio.pricingOptions.length === 0 ? (
              <p className="font-medium">Price Unknown</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {studio.pricingOptions.map((option, index) => (
                  <li key={index} className="flex items-baseline justify-between gap-2">
                    <span className="text-sm text-muted-foreground">{option.label}</span>
                    <span className="font-semibold">₹{option.price.toLocaleString("en-IN")}</span>
                  </li>
                ))}
              </ul>
            )}
            <ActionButton
              actionType={studio.action_type}
              actionValue={studio.action_value}
              className="mt-4 w-full"
            />
          </div>
        </aside>
      </div>

      {studio.description && (
        <div className="mt-6">
          <h2 className="font-heading mb-3 text-xl font-semibold">Overview</h2>
          <p className="leading-relaxed text-foreground/90">{studio.description}</p>
        </div>
      )}

      {studio.youtube_url && (
        <div className="mt-8">
          <h2 className="font-heading mb-3 text-xl font-semibold">Studio Video</h2>
          <YouTubeEmbed url={studio.youtube_url} title={studio.name} />
        </div>
      )}

      {(hasCoords || studio.map_url) && (
        <div className="mt-10">
          <h2 className="font-heading mb-4 text-xl font-semibold">Location &amp; Distance</h2>
          <div className="grid grid-cols-1 overflow-hidden rounded-xl border bg-white shadow-sm md:grid-cols-2">
            <div className="flex flex-col justify-between gap-4 p-5">
              <div>
                <p className="font-medium">{studio.name}</p>
                <p className="text-sm text-muted-foreground">
                  {[studio.city?.name, studio.state?.name].filter(Boolean).join(", ")}
                </p>
              </div>
              {hasCoords && (
                <div className="flex items-start gap-2 text-sm">
                  <Navigation className="mt-0.5 size-4 shrink-0 text-pb-brand" />
                  <div>
                    <p className="text-muted-foreground">Distance from you</p>
                    <DistanceDisplay latitude={studio.latitude!} longitude={studio.longitude!} />
                  </div>
                </div>
              )}
              <GoToLocationButton
                mapUrl={studio.map_url}
                latitude={studio.latitude}
                longitude={studio.longitude}
              />
            </div>
            <div className="min-h-64">
              {hasCoords ? (
                <MiniMap latitude={studio.latitude!} longitude={studio.longitude!} label={studio.name} />
              ) : (
                <div className="flex h-full min-h-64 items-center justify-center bg-muted text-sm text-muted-foreground">
                  Map unavailable
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {studio.country && studio.state && studio.city && (
        <div className="mt-10 border-t pt-6">
          <h2 className="font-heading mb-3 text-xl font-semibold">Explore More Studios</h2>
          <Link
            href={`/studios/${studio.country.slug}/${studio.state.slug}/${studio.city.slug}`}
            className="text-sm font-medium text-pb-brand hover:underline"
          >
            All pre-wedding photo studios in {studio.city.name}
          </Link>
        </div>
      )}

      <JsonLd data={buildLocalBusinessJsonLd(studio)} />
    </div>
  );
}
