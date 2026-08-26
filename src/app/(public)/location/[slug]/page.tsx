import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Tag, Globe, Map as MapIcon, MapPin, Navigation } from "lucide-react";
import { getPublishedLocationBySlug } from "@/lib/public-data";
import { formatPricing } from "@/lib/format";
import { ImageGallery } from "@/components/public/image-gallery";
import { ShareButton } from "@/components/public/share-button";
import { YouTubeEmbed } from "@/components/public/youtube-embed";
import { MiniMap } from "@/components/public/mini-map";
import { DistanceDisplay } from "@/components/public/distance-display";
import { GoToLocationButton } from "@/components/public/go-to-location-button";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { ExtraDetailsList } from "@/components/public/extra-details-list";
import { JsonLd } from "@/components/public/json-ld";
import { absoluteUrl, buildPlaceJsonLd } from "@/lib/jsonld";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const location = await getPublishedLocationBySlug(slug);
  if (!location) return {};

  const place = [location.city?.name, location.state?.name].filter(Boolean).join(", ");
  const title = `${location.name} - Photoshoot Location in ${location.city?.name ?? place}`;
  const description =
    location.description ?? `${location.name}, a photoshoot location in ${place}.`;

  return {
    title,
    description,
    alternates: { canonical: `/location/${location.slug}` },
    openGraph: {
      title,
      description,
      url: `/location/${location.slug}`,
      siteName: "PhotoBlinks",
      type: "website",
      images: location.images[0] ? [location.images[0]] : undefined,
    },
  };
}

export default async function LocationDetailPage({ params }: Props) {
  const { slug } = await params;
  const location = await getPublishedLocationBySlug(slug);
  if (!location) notFound();

  const hasCoords = location.latitude != null && location.longitude != null;

  const breadcrumbItems = [
    { name: "Home", path: "/" },
    { name: "Locations", path: "/locations" },
    ...(location.country
      ? [{ name: location.country.name, path: `/locations/${location.country.slug}` }]
      : []),
    ...(location.country && location.state
      ? [{ name: location.state.name, path: `/locations/${location.country.slug}/${location.state.slug}` }]
      : []),
    ...(location.country && location.state && location.city
      ? [
          {
            name: location.city.name,
            path: `/locations/${location.country.slug}/${location.state.slug}/${location.city.slug}`,
          },
        ]
      : []),
    ...(location.country && location.state && location.city && location.category
      ? [
          {
            name: location.category.name,
            path: `/locations/${location.country.slug}/${location.state.slug}/${location.city.slug}/${location.category.slug}`,
          },
        ]
      : []),
    { name: location.name, path: `/location/${location.slug}` },
  ];

  const infoRows = [
    location.category && { icon: Tag, label: "Category", value: location.category.name },
    location.country && { icon: Globe, label: "Country", value: location.country.name },
    location.state && { icon: MapIcon, label: "State", value: location.state.name },
    location.city && { icon: MapPin, label: "City", value: location.city.name },
  ].filter(Boolean) as { icon: typeof Tag; label: string; value: string }[];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={breadcrumbItems} />
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold sm:text-4xl">{location.name}</h1>
          <p className="mt-1 flex items-center gap-1 text-muted-foreground">
            <MapPin className="size-4" />
            {[location.city?.name, location.state?.name].filter(Boolean).join(", ")}
          </p>
        </div>
        <ShareButton title={location.name} url={absoluteUrl(`/location/${location.slug}`)} />
      </div>

      <ImageGallery images={location.images} alt={location.name} />

      <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="font-heading mb-4 text-xl font-semibold">About This Location</h2>
          <dl className="flex flex-col gap-2.5 text-sm">
            {infoRows.map((row) => (
              <div key={row.label} className="flex items-center gap-3">
                <row.icon className="size-4 shrink-0 text-muted-foreground" />
                <dt className="w-20 shrink-0 text-muted-foreground">{row.label}</dt>
                <dd className="font-medium">{row.value}</dd>
              </div>
            ))}
          </dl>
          <ExtraDetailsList details={location} />
        </div>

        <aside className="flex flex-col gap-4">
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <span className="flex size-7 items-center justify-center rounded-full bg-pb-brand/10">
                <Tag className="size-3.5 text-pb-brand" />
              </span>
              Pricing
            </div>
            <p className="font-heading text-3xl font-semibold">
              {formatPricing(location.pricing_type, location.price)}
            </p>
            {location.pricing_type === "paid" && (
              <p className="text-sm text-muted-foreground">Photoshoot Price</p>
            )}
            {location.pricing_type === "free" && (
              <p className="text-sm text-muted-foreground">Free Photoshoot Location</p>
            )}
          </div>
        </aside>
      </div>

      {location.description && (
        <p className="mt-6 leading-relaxed text-foreground/90">{location.description}</p>
      )}

      {location.youtube_url && (
        <div className="mt-8">
          <h2 className="font-heading mb-3 text-xl font-semibold">Location Video</h2>
          <YouTubeEmbed url={location.youtube_url} title={location.name} />
        </div>
      )}

      {(hasCoords || location.map_url) && (
        <div className="mt-10">
          <h2 className="font-heading mb-4 text-xl font-semibold">Location &amp; Distance</h2>
          <div className="grid grid-cols-1 overflow-hidden rounded-xl border bg-white shadow-sm md:grid-cols-2">
            <div className="flex flex-col justify-between gap-4 p-5">
              <div>
                <p className="font-medium">{location.name}</p>
                <p className="text-sm text-muted-foreground">
                  {[location.city?.name, location.state?.name].filter(Boolean).join(", ")}
                </p>
              </div>
              {hasCoords && (
                <div className="flex items-start gap-2 text-sm">
                  <Navigation className="mt-0.5 size-4 shrink-0 text-pb-brand" />
                  <div>
                    <p className="text-muted-foreground">Distance from you</p>
                    <DistanceDisplay latitude={location.latitude!} longitude={location.longitude!} />
                  </div>
                </div>
              )}
              <GoToLocationButton
                mapUrl={location.map_url}
                latitude={location.latitude}
                longitude={location.longitude}
              />
            </div>
            <div className="min-h-64">
              {hasCoords ? (
                <MiniMap latitude={location.latitude!} longitude={location.longitude!} label={location.name} />
              ) : (
                <div className="flex h-full min-h-64 items-center justify-center bg-muted text-sm text-muted-foreground">
                  Map unavailable
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <JsonLd data={buildPlaceJsonLd(location)} />
    </div>
  );
}
