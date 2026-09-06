import type { Metadata } from "next";
import { getPublishedLocations, getSharedFavouriteLocationIds } from "@/lib/public-data";
import { LocationCard } from "@/components/public/location-card";

type Props = { params: Promise<{ token: string }> };

// Must always reflect the owner's CURRENT favourites, never a cached
// snapshot — Next would otherwise statically cache this route's rendered
// output per token (it reads no cookies/headers, so it's static-eligible
// by default). Traffic here is low and personal, not a public SEO page, so
// there's no meaningful performance cost to opting out of caching.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  return {
    title: "Shared Favourites",
    description: "Explore this collection of pre-wedding photoshoot locations on PhotoBlinks.",
    // User-generated sharing links, not a landing/SEO page — never indexed,
    // never in the sitemap, no canonical of its own.
    robots: { index: false, follow: false },
    alternates: { canonical: `/favourites/share/${token}` },
    openGraph: {
      title: "Shared Favourites | PhotoBlinks",
      description: "Explore this collection of pre-wedding photoshoot locations on PhotoBlinks.",
      siteName: "PhotoBlinks",
      type: "website",
    },
  };
}

export default async function SharedFavouritesPage({ params }: Props) {
  const { token } = await params;
  const locationIds = await getSharedFavouriteLocationIds(token);
  const locations = locationIds.length > 0 ? await getPublishedLocations({ locationIds }) : [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold">Shared Favourites</h1>
      <p className="mt-1 text-muted-foreground">
        Pre-wedding photoshoot locations someone chose to share with you.
      </p>

      {locations.length === 0 ? (
        <div className="mt-8 rounded-xl border bg-white p-10 text-center shadow-sm">
          <p className="text-muted-foreground">No locations in this shared collection right now.</p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
          {locations.map((location) => (
            <LocationCard key={location.id} location={location} />
          ))}
        </div>
      )}
    </div>
  );
}
