"use client";

import { useState } from "react";
import Image from "next/image";
import { Images } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ImageGallery({ images, alt }: { images: string[]; alt: string }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (images.length === 0) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-xl bg-muted text-muted-foreground">
        No photos yet
      </div>
    );
  }

  const [primary, ...rest] = images;
  const supporting = rest.slice(0, 4);
  const remaining = rest.length - supporting.length;

  return (
    <>
      {/* Mobile: simple stacked column. Desktop: primary image left, three
          supporting rows on the right (two full-width, one split in two). */}
      <div className="flex flex-col gap-2 sm:h-[420px] sm:flex-row lg:h-[480px]">
        <div className="relative aspect-4/3 shrink-0 overflow-hidden rounded-xl bg-muted sm:aspect-auto sm:h-full sm:w-[55%]">
          <Image
            src={primary}
            alt={alt}
            fill
            priority
            sizes="(min-width: 640px) 55vw, 100vw"
            className="object-cover"
            unoptimized
          />
        </div>

        {supporting.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:flex sm:h-full sm:w-[45%] sm:grid-cols-none sm:flex-col">
            {supporting[0] && (
              <div className="relative aspect-4/3 overflow-hidden rounded-xl bg-muted sm:aspect-auto sm:flex-1">
                <Image
                  src={supporting[0]}
                  alt={`${alt} — photo 2`}
                  fill
                  sizes="(min-width: 640px) 45vw, 50vw"
                  className="object-cover"
                  unoptimized
                />
              </div>
            )}
            {supporting[1] && (
              <div className="relative aspect-4/3 overflow-hidden rounded-xl bg-muted sm:aspect-auto sm:flex-1">
                <Image
                  src={supporting[1]}
                  alt={`${alt} — photo 3`}
                  fill
                  sizes="(min-width: 640px) 45vw, 50vw"
                  className="object-cover"
                  unoptimized
                />
              </div>
            )}
            {(supporting[2] || supporting[3]) && (
              <div className="col-span-2 flex gap-2 sm:flex-1">
                {supporting[2] && (
                  <div className="relative aspect-4/3 flex-1 overflow-hidden rounded-xl bg-muted sm:aspect-auto">
                    <Image
                      src={supporting[2]}
                      alt={`${alt} — photo 4`}
                      fill
                      sizes="(min-width: 640px) 22vw, 50vw"
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                )}
                {supporting[3] && (
                  <div className="relative aspect-4/3 flex-1 overflow-hidden rounded-xl bg-muted sm:aspect-auto">
                    <Image
                      src={supporting[3]}
                      alt={`${alt} — photo 5`}
                      fill
                      sizes="(min-width: 640px) 22vw, 50vw"
                      className="object-cover"
                      unoptimized
                    />
                    <button
                      type="button"
                      onClick={() => setLightboxOpen(true)}
                      className="absolute inset-0 flex items-end justify-end bg-black/20 p-3 transition-colors hover:bg-black/35"
                    >
                      <span className="flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white">
                        <Images className="size-3.5" />
                        View all photos{remaining > 0 ? ` (+${remaining})` : ""}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{alt} — Photos</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {images.map((image, index) => (
              <div
                key={image}
                className="relative aspect-4/3 overflow-hidden rounded-lg bg-muted"
              >
                <Image
                  src={image}
                  alt={`${alt} — photo ${index + 1}`}
                  fill
                  sizes="(min-width: 640px) 33vw, 50vw"
                  className="object-cover"
                  unoptimized
                />
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
