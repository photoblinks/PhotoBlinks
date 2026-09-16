import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublishedLocationBySlug } from "@/lib/public-data";
import { getValidatedYouTubeVideo } from "@/lib/youtube";
import { LocationDetailContent } from "@/components/public/location-detail-content";

type Props = { params: Promise<{ slug: string }> };

// No searchParams/cookies here, so this route is eligible for ISR — the
// same 60s window as the underlying cached data queries (public-data.ts).
// generateStaticParams is required (even empty) for a dynamic segment to
// use ISR at all — without it Next renders it fully dynamic on every
// request regardless of `revalidate` (see Next's generateStaticParams
// docs: "you must always return an array... otherwise the route will be
// dynamically rendered"). An empty array means every slug is generated
// on-demand on first visit, then served from cache until revalidation.
export const revalidate = 60;

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const location = await getPublishedLocationBySlug(slug);
  if (!location) return {};

  const place = [location.city?.name, location.state?.name].filter(Boolean).join(", ");
  const title =
    location.meta_title ||
    `${location.name} - Pre-Wedding Photoshoot Location in ${location.city?.name ?? place}`;
  const description =
    location.meta_description ||
    location.description ||
    (location.category
      ? `${location.name}, a ${location.category.name.toLowerCase()} pre-wedding photoshoot location in ${place}.`
      : `${location.name}, a pre-wedding photoshoot location in ${place}.`);

  const video = getValidatedYouTubeVideo(location.youtube_url);

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
      videos: video
        ? [{ url: video.embedUrl, width: 640, height: 360, type: "text/html" }]
        : undefined,
    },
  };
}

export default async function LocationDetailPage({ params }: Props) {
  const { slug } = await params;
  const location = await getPublishedLocationBySlug(slug);
  if (!location) notFound();

  return <LocationDetailContent location={location} showSponsoredPhotographer />;
}
