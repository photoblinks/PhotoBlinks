import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPublishedLocations } from "@/lib/public-data";
import { absoluteUrl } from "@/lib/jsonld";
import { safeNextPath } from "@/lib/safe-redirect";
import { LocationCard } from "@/components/public/location-card";
import { ShareCollectionPanel } from "@/components/public/share-collection-panel";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "My Favourites",
  robots: { index: false, follow: false },
};

// Inherently per-user/private — reads the session via cookies(), so this
// route is (and should be) dynamically rendered, unlike the rest of the
// public site. That's an isolated, expected exception: it doesn't affect
// the ISR/caching of any other route (see src/lib/public-data.ts).
export default async function FavouritesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/sign-in?next=${encodeURIComponent(safeNextPath("/favourites"))}`);

  const [{ data: favouriteRows }, { data: shareRow }] = await Promise.all([
    supabase.from("favourites").select("location_id").eq("user_id", user.id),
    supabase
      .from("share_collections")
      .select("token, revoked_at")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const locationIds = (favouriteRows ?? []).map((row) => row.location_id);
  const locations = locationIds.length > 0 ? await getPublishedLocations({ locationIds }) : [];

  const shareUrl =
    shareRow && shareRow.revoked_at === null
      ? absoluteUrl(`/favourites/share/${shareRow.token}`)
      : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="font-heading mb-6 text-3xl font-semibold">My Favourites</h1>

      {locations.length > 0 && (
        <div className="mb-8 flex flex-col gap-4 rounded-xl border bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div>
            <h2 className="font-heading text-lg font-semibold">
              Share your favourite pre-wedding locations with your partner
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Save your favourites in one place and share the collection with your partner. They
              can view it without signing in.
            </p>
          </div>
          <div className="sm:shrink-0">
            <ShareCollectionPanel shareUrl={shareUrl} />
          </div>
        </div>
      )}

      {locations.length === 0 ? (
        <div className="rounded-xl border bg-white p-10 text-center shadow-sm">
          <p className="text-muted-foreground">You haven&apos;t saved any locations yet.</p>
          <Button render={<Link href="/locations" />} className="mt-4">
            Browse Locations
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
          {locations.map((location) => (
            <LocationCard key={location.id} location={location} />
          ))}
        </div>
      )}
    </div>
  );
}
