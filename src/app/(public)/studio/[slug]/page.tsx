import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublishedStudioBySlug } from "@/lib/public-data";
import { ImageGallery } from "@/components/public/image-gallery";
import { ShareButton } from "@/components/public/share-button";
import { YouTubeEmbed } from "@/components/public/youtube-embed";
import { MiniMap } from "@/components/public/mini-map";
import { DistanceDisplay } from "@/components/public/distance-display";
import { GoToLocationButton } from "@/components/public/go-to-location-button";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { JsonLd } from "@/components/public/json-ld";
import { absoluteUrl, buildLocalBusinessJsonLd } from "@/lib/jsonld";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const studio = await getPublishedStudioBySlug(slug);
  if (!studio) return {};

  const place = [studio.city?.name, studio.state?.name].filter(Boolean).join(", ");
  const title = `${studio.name} - Studio in ${studio.city?.name ?? place}`;
  const description = studio.description ?? `${studio.name}, a photography studio in ${place}.`;

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
    ...(studio.state ? [{ name: studio.state.name, path: `/studios/${studio.state.slug}` }] : []),
    ...(studio.state && studio.city
      ? [{ name: studio.city.name, path: `/studios/${studio.state.slug}/${studio.city.slug}` }]
      : []),
    { name: studio.name, path: `/studio/${studio.slug}` },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={breadcrumbItems} />
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{studio.name}</h1>
          <p className="mt-1 text-muted-foreground">
            {[studio.city?.name, studio.state?.name].filter(Boolean).join(", ")}
          </p>
        </div>
        <ShareButton title={studio.name} url={absoluteUrl(`/studio/${studio.slug}`)} />
      </div>

      <ImageGallery images={studio.images} alt={studio.name} />

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-xl font-semibold">About This Studio</h2>
          <dl className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Country</dt>
              <dd className="font-medium">{studio.country}</dd>
            </div>
            {studio.state && (
              <div>
                <dt className="text-muted-foreground">State</dt>
                <dd className="font-medium">{studio.state.name}</dd>
              </div>
            )}
            {studio.city && (
              <div>
                <dt className="text-muted-foreground">City</dt>
                <dd className="font-medium">{studio.city.name}</dd>
              </div>
            )}
          </dl>
          {studio.description && (
            <p className="leading-relaxed text-foreground/90">{studio.description}</p>
          )}

          {studio.youtube_url && (
            <div className="mt-8">
              <h2 className="mb-3 text-xl font-semibold">Studio Video</h2>
              <YouTubeEmbed url={studio.youtube_url} title={studio.name} />
            </div>
          )}

          {hasCoords && (
            <div className="mt-8">
              <h2 className="mb-3 text-xl font-semibold">Location &amp; Distance</h2>
              <MiniMap latitude={studio.latitude!} longitude={studio.longitude!} label={studio.name} />
              <p className="mt-2 text-sm text-muted-foreground">
                {[studio.city?.name, studio.state?.name].filter(Boolean).join(", ")} · {studio.latitude!.toFixed(4)}, {studio.longitude!.toFixed(4)}
              </p>
              <div className="mt-2">
                <DistanceDisplay latitude={studio.latitude!} longitude={studio.longitude!} />
              </div>
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <div className="rounded-xl border p-4">
            <p className="mb-3 text-sm text-muted-foreground">Pricing</p>
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
          </div>

          <GoToLocationButton
            mapUrl={studio.map_url}
            latitude={studio.latitude}
            longitude={studio.longitude}
          />
        </aside>
      </div>

      <JsonLd data={buildLocalBusinessJsonLd(studio)} />
    </div>
  );
}
