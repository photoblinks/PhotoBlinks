import Image from "next/image";
import { Phone, MessageCircle } from "lucide-react";
import { buildWhatsAppLink } from "@/lib/format";
import type { PublicPhotographerPhoto } from "@/lib/public-data";

type Props = {
  photos: PublicPhotographerPhoto[];
  locationName: string;
};

/** Approved photographer-submitted photos for a location.
 * Pure server component — no client JS needed. Contact buttons are plain
 * anchor tags (tel: and wa.me) that work without JS.
 * Renders nothing when photos is empty. */
export function PhotographerPhotoSection({ photos, locationName }: Props) {
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
                src={photo.image_url}
                alt={`${photo.title} — ${locationName}`}
                fill
                className="object-cover"
                sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
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
                <a
                  href={`tel:${photo.phone_number}`}
                  className="flex items-center justify-center gap-1.5 rounded-md border border-pb-brand bg-white px-2 py-1.5 text-xs font-medium text-pb-brand hover:bg-pb-brand/5 dark:bg-transparent"
                >
                  <Phone className="size-3.5" aria-hidden="true" />
                  Call
                </a>
                <a
                  href={buildWhatsAppLink(photo.phone_number)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 rounded-md border border-pb-brand bg-white px-2 py-1.5 text-xs font-medium text-pb-brand hover:bg-pb-brand/5 dark:bg-transparent"
                >
                  <MessageCircle className="size-3.5" aria-hidden="true" />
                  WhatsApp
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
