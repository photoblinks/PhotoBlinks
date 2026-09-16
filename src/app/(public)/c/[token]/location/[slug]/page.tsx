import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getPublishedLocationBySlug, sharedLocationCollectionHasLocation } from "@/lib/public-data";
import { LocationDetailContent } from "@/components/public/location-detail-content";

type Props = { params: Promise<{ token: string; slug: string }> };

// Access depends on the live token/membership check below — never serve a
// cached render.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const location = await getPublishedLocationBySlug(slug);
  return {
    ...(location ? { title: location.name, alternates: { canonical: `/location/${location.slug}` } } : {}),
    robots: { index: false, follow: false },
  };
}

/** A location opened from a photographer's share link. Server-side, BOTH must
 * hold before anything collection-scoped renders:
 *   1. the published location with exactly this slug exists (cached accessor
 *      only returns published rows), and
 *   2. the token is active and that published location belongs to it
 *      (shared_location_collection_has_location, checked on slug + published).
 * Otherwise the visitor is sent to the normal /location/[slug] page (or 404),
 * which reveals nothing about the collection.
 *
 * This route is the trusted context for hiding the sponsored photographer:
 * it hard-codes showSponsoredPhotographer={false}, so the sponsored query is
 * never made and the card (with its impression/click analytics) never mounts.
 * No query param, cookie, or client state is involved. */
export default async function SharedCollectionLocationPage({ params }: Props) {
  const { token, slug } = await params;
  const [location, isMember] = await Promise.all([
    getPublishedLocationBySlug(slug),
    sharedLocationCollectionHasLocation(token, slug),
  ]);

  if (!location) notFound();
  if (!isMember || location.slug !== slug) redirect(`/location/${location.slug}`);

  return (
    <>
      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
        <Link
          href={`/c/${encodeURIComponent(token)}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-pb-brand hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to shared locations
        </Link>
      </div>
      <LocationDetailContent location={location} showSponsoredPhotographer={false} />
    </>
  );
}
