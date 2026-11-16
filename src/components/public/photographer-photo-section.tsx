import Image from "next/image";
import { ContactRevealButton } from "@/components/public/contact-reveal-button";
import { PHOTOGRAPHER_PHOTO_WIDTH, toTransformUrl } from "@/lib/cf-image-loader";
import type { PublicPhotographerPhoto } from "@/lib/public-data";

type Props = {
  photos: PublicPhotographerPhoto[];
  locationName: string;
  locationId: string;
};

/** Approved photographer-submitted photos for a location.
 * Server component; the contact buttons reveal the number only on click
 * (the number is never in the page).
 * Renders nothing when photos is empty. */
export function PhotographerPhotoSection({ photos, locationName, locationId }: Props) {
  if (photos.length === 0) return null;

  return (
    <div className="mt-14">
      <h2 className="font-heading mb-4 text-xl font-semibold">
        Photos from Photographers
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {photos.map((photo) => (
          <div key={photo.id} className="overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-card">
            <div className="relative aspect-4/3 w-full">
              <Image
                src={toTransformUrl(photo.image_url, PHOTOGRAPHER_PHOTO_WIDTH)}
                alt={`${photo.title} — ${locationName}`}
                fill
                unoptimized
                sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                className="object-cover"
              />
            </div>
            <div className="p-3">
              <p className="text-sm font-medium">{photo.title}</p>
              {photo.description && (
                <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                  {photo.description}
                </p>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <ContactRevealButton
                  target={{ kind: "photo", id: photo.id, locationId }}
                  channel="call"
                  label="Call Now"
                  variant="outline"
                  size="sm"
                  className="border-pb-brand text-pb-brand hover:bg-pb-brand/5"
                />
                <ContactRevealButton
                  target={{ kind: "photo", id: photo.id, locationId }}
                  channel="whatsapp"
                  label="WhatsApp"
                  variant="outline"
                  size="sm"
                  className="border-pb-brand text-pb-brand hover:bg-pb-brand/5"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
