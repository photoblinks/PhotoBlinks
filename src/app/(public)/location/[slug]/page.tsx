import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublishedLocationBySlug } from "@/lib/public-data";
import { formatPricing } from "@/lib/format";
import { ImageGallery } from "@/components/public/image-gallery";
import { ShareButton } from "@/components/public/share-button";
import { YouTubeEmbed } from "@/components/public/youtube-embed";
import { MiniMap } from "@/components/public/mini-map";
import { DistanceDisplay } from "@/components/public/distance-display";
import { GoToLocationButton } from "@/components/public/go-to-location-button";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
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
    ...(location.state ? [{ name: location.state.name, path: `/locations/${location.state.slug}` }] : []),
    ...(location.state && location.city
      ? [{ name: location.city.name, path: `/locations/${location.state.slug}/${location.city.slug}` }]
      : []),
    ...(location.state && location.city && location.category
      ? [
          {
            name: location.category.name,
            path: `/locations/${location.state.slug}/${location.city.slug}/${location.category.slug}`,
          },
        ]
      : []),
    { name: location.name, path: `/location/${location.slug}` },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={breadcrumbItems} />
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{location.name}</h1>
          <p className="mt-1 text-muted-foreground">
            {[location.city?.name, location.state?.name].filter(Boolean).join(", ")}
          </p>
        </div>
        <ShareButton title={location.name} url={absoluteUrl(`/location/${location.slug}`)} />
      </div>

      <ImageGallery images={location.images} alt={location.name} />

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-xl font-semibold">About This Location</h2>
          <dl className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {location.category && (
              <div>
                <dt className="text-muted-foreground">Category</dt>
                <dd className="font-medium">{location.category.name}</dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">Country</dt>
              <dd className="font-medium">{location.country}</dd>
            </div>
            {location.state && (
              <div>
                <dt className="text-muted-foreground">State</dt>
                <dd className="font-medium">{location.state.name}</dd>
              </div>
            )}
            {location.city && (
              <div>
                <dt className="text-muted-foreground">City</dt>
                <dd className="font-medium">{location.city.name}</dd>
              </div>
            )}
          </dl>
          {location.description && (
            <p className="leading-relaxed text-foreground/90">{location.description}</p>
          )}

          {location.youtube_url && (
            <div className="mt-8">
              <h2 className="mb-3 text-xl font-semibold">Location Video</h2>
              <YouTubeEmbed url={location.youtube_url} title={location.name} />
            </div>
          )}

          {hasCoords && (
            <div className="mt-8">
              <h2 className="mb-3 text-xl font-semibold">Location &amp; Distance</h2>
              <MiniMap latitude={location.latitude!} longitude={location.longitude!} label={location.name} />
              <p className="mt-2 text-sm text-muted-foreground">
                {[location.city?.name, location.state?.name].filter(Boolean).join(", ")} · {location.latitude!.toFixed(4)}, {location.longitude!.toFixed(4)}
              </p>
              <div className="mt-2">
                <DistanceDisplay latitude={location.latitude!} longitude={location.longitude!} />
              </div>
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <div className="rounded-xl border p-4">
            <p className="mb-1 text-sm text-muted-foreground">Pricing</p>
            <p className="text-2xl font-semibold">
              {formatPricing(location.pricing_type, location.price)}
            </p>
            {location.pricing_type === "paid" && (
              <p className="text-sm text-muted-foreground">Photoshoot Price</p>
            )}
            {location.pricing_type === "free" && (
              <p className="text-sm text-muted-foreground">Free Photoshoot Location</p>
            )}
          </div>

          <GoToLocationButton
            mapUrl={location.map_url}
            latitude={location.latitude}
            longitude={location.longitude}
          />
        </aside>
      </div>

      <JsonLd data={buildPlaceJsonLd(location)} />
    </div>
  );
}
