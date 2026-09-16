import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MessageCircle, Phone, UserRound } from "lucide-react";
import { getPublishedLocations, getSharedLocationCollection } from "@/lib/public-data";
import { buildWhatsAppLink } from "@/lib/format";
import { LocationCard } from "@/components/public/location-card";

type Props = { params: Promise<{ token: string }> };

// The token is the access capability: always resolve it live (an edit or
// delete must take effect immediately), never from a cached render.
export const dynamic = "force-dynamic";

const NOT_FOUND_METADATA: Metadata = { robots: { index: false, follow: false } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const collection = await getSharedLocationCollection(token);
  if (!collection) return NOT_FOUND_METADATA;

  const title = `${collection.name} — shared by ${collection.displayName}`;
  return {
    title,
    description: `Pre-wedding photoshoot locations curated by ${collection.displayName} on PhotoBlinks.`,
    // Private share link — never indexed, never followed, no canonical.
    robots: { index: false, follow: false },
    openGraph: { title, siteName: "PhotoBlinks", type: "website" },
  };
}

export default async function SharedLocationCollectionPage({ params }: Props) {
  const { token } = await params;
  const collection = await getSharedLocationCollection(token);
  if (!collection) notFound();

  const cards =
    collection.locationIds.length > 0 ? await getPublishedLocations({ locationIds: collection.locationIds }) : [];
  // getPublishedLocations orders by recency; restore the photographer's order.
  const byId = new Map(cards.map((card) => [card.id, card]));
  const locations = collection.locationIds.flatMap((id) => byId.get(id) ?? []);

  const whatsapp = collection.whatsappNumber || collection.phoneNumber;
  const avatarUrl = collection.avatarUrl?.startsWith("https://") ? collection.avatarUrl : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <section className="rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
            {avatarUrl ? (
              <Image src={avatarUrl} alt={collection.displayName} fill sizes="80px" className="object-cover" />
            ) : (
              <UserRound className="size-9 text-muted-foreground" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-heading text-xl font-semibold">{collection.displayName}</p>
            {collection.studioName && <p className="text-sm text-muted-foreground">{collection.studioName}</p>}
            {collection.bio && <p className="mt-2 text-sm leading-relaxed text-foreground/90">{collection.bio}</p>}
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-2 sm:w-64">
            <a
              href={`tel:${collection.phoneNumber}`}
              className="flex items-center justify-center gap-1.5 rounded-md border border-pb-brand bg-white px-3 py-2 text-sm font-medium text-pb-brand hover:bg-pb-brand/5"
            >
              <Phone className="size-4" aria-hidden="true" />
              Call
            </a>
            <a
              href={buildWhatsAppLink(whatsapp)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 rounded-md border border-pb-brand bg-white px-3 py-2 text-sm font-medium text-pb-brand hover:bg-pb-brand/5"
            >
              <MessageCircle className="size-4" aria-hidden="true" />
              WhatsApp
            </a>
          </div>
        </div>
      </section>

      <h1 className="font-heading mt-10 text-3xl font-semibold break-words">{collection.name}</h1>
      <p className="mt-1 text-muted-foreground">
        {locations.length} pre-wedding photoshoot location{locations.length === 1 ? "" : "s"}
      </p>

      {locations.length === 0 ? (
        <div className="mt-8 rounded-xl border bg-white p-10 text-center shadow-sm">
          <p className="text-muted-foreground">No locations in this list right now.</p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
          {locations.map((location) => (
            <LocationCard
              key={location.id}
              location={location}
              href={`/c/${encodeURIComponent(token)}/location/${location.slug}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
