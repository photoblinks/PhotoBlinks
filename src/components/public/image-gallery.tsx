"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Images, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export function ImageGallery({
  images,
  alt,
  imageCaptions,
}: {
  images: string[];
  /** Base context description, e.g. "{name} in {city}". Used for the cover
   * image and as the basis for the fallback description on every other
   * image that has no caption of its own. */
  alt: string;
  /** Admin-provided per-image alt text, same order/length as `images`.
   * Falls back to a contextual description (never numbering) when absent. */
  imageCaptions?: (string | null)[];
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const showPrev = useCallback(() => {
    setActiveIndex((i) => (i - 1 + images.length) % images.length);
  }, [images.length]);

  const showNext = useCallback(() => {
    setActiveIndex((i) => (i + 1) % images.length);
  }, [images.length]);

  // Left/right arrow keys navigate the lightbox (Escape-to-close is handled
  // by the Dialog primitive itself).
  useEffect(() => {
    if (!lightboxOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") showPrev();
      if (e.key === "ArrowRight") showNext();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxOpen, showPrev, showNext]);

  if (images.length === 0) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-xl bg-muted text-muted-foreground">
        No photos yet
      </div>
    );
  }

  const [primary, ...rest] = images;
  const supporting = rest.slice(0, 4);
  const extra = rest.slice(4);
  const remaining = extra.length;

  // Per-image alt text: an admin-provided caption when one exists, otherwise
  // a contextual description built from `alt` — never a meaningless "photo N".
  function captionAt(index: number) {
    const caption = imageCaptions?.[index]?.trim();
    return caption || `${alt} — photography location`;
  }

  function openLightbox(index: number) {
    setActiveIndex(index);
    setLightboxOpen(true);
  }

  return (
    <>
      {/* Mobile: simple stacked column. Desktop: primary image left, three
          supporting rows on the right (two full-width, one split in two).
          Every photo opens the full-size, scrollable lightbox when clicked. */}
      <div className="flex flex-col gap-2 sm:h-[420px] sm:flex-row lg:h-[480px]">
        <button
          type="button"
          onClick={() => openLightbox(0)}
          aria-label={`View ${alt} photos`}
          className="relative aspect-4/3 shrink-0 overflow-hidden rounded-xl bg-muted sm:aspect-auto sm:h-full sm:w-[55%]"
        >
          <Image
            src={primary}
            alt={captionAt(0)}
            fill
            priority
            sizes="(min-width: 640px) 55vw, 100vw"
            className="object-cover"
          />
        </button>

        {supporting.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:flex sm:h-full sm:w-[45%] sm:grid-cols-none sm:flex-col">
            {supporting[0] && (
              <button
                type="button"
                onClick={() => openLightbox(1)}
                aria-label={`View ${alt} photo 2`}
                className="relative aspect-4/3 overflow-hidden rounded-xl bg-muted sm:aspect-auto sm:flex-1"
              >
                <Image
                  src={supporting[0]}
                  alt={captionAt(1)}
                  fill
                  sizes="(min-width: 640px) 45vw, 50vw"
                  className="object-cover"
                />
              </button>
            )}
            {supporting[1] && (
              <button
                type="button"
                onClick={() => openLightbox(2)}
                aria-label={`View ${alt} photo 3`}
                className="relative aspect-4/3 overflow-hidden rounded-xl bg-muted sm:aspect-auto sm:flex-1"
              >
                <Image
                  src={supporting[1]}
                  alt={captionAt(2)}
                  fill
                  sizes="(min-width: 640px) 45vw, 50vw"
                  className="object-cover"
                />
              </button>
            )}
            {(supporting[2] || supporting[3]) && (
              <div className="col-span-2 flex gap-2 sm:flex-1">
                {supporting[2] && (
                  <button
                    type="button"
                    onClick={() => openLightbox(3)}
                    aria-label={`View ${alt} photo 4`}
                    className="relative aspect-4/3 flex-1 overflow-hidden rounded-xl bg-muted sm:aspect-auto"
                  >
                    <Image
                      src={supporting[2]}
                      alt={captionAt(3)}
                      fill
                      sizes="(min-width: 640px) 22vw, 50vw"
                      className="object-cover"
                    />
                  </button>
                )}
                {supporting[3] && (
                  <button
                    type="button"
                    onClick={() => openLightbox(4)}
                    aria-label={`View all ${alt} photos`}
                    className="relative aspect-4/3 flex-1 overflow-hidden rounded-xl bg-muted sm:aspect-auto"
                  >
                    <Image
                      src={supporting[3]}
                      alt={captionAt(4)}
                      fill
                      sizes="(min-width: 640px) 22vw, 50vw"
                      className="object-cover"
                    />
                    <span className="absolute inset-0 flex items-end justify-end bg-black/20 p-3 transition-colors hover:bg-black/35">
                      <span className="flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white">
                        <Images className="size-3.5" />
                        View all photos{remaining > 0 ? ` (+${remaining})` : ""}
                      </span>
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {extra.length > 0 && (
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {extra.map((src, i) => {
            const index = 5 + i;
            return (
              <button
                key={src}
                type="button"
                onClick={() => openLightbox(index)}
                aria-label={`View ${alt} photo ${index + 1}`}
                className="relative aspect-4/3 overflow-hidden rounded-xl bg-muted"
              >
                <Image
                  src={src}
                  alt={captionAt(index)}
                  fill
                  loading="lazy"
                  sizes="(min-width: 768px) 16vw, (min-width: 640px) 25vw, 33vw"
                  className="object-cover"
                />
              </button>
            );
          })}
        </div>
      )}

      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent
          showCloseButton={false}
          className="top-0 left-0 h-screen max-h-screen w-screen max-w-none translate-x-0 translate-y-0 rounded-none bg-black/95 p-0 sm:max-w-none"
        >
          <DialogTitle className="sr-only">{alt} — Photos</DialogTitle>

          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            aria-label="Close"
            className="absolute top-4 left-4 z-10 flex size-10 items-center justify-center rounded-full bg-white/90 text-foreground shadow-md hover:bg-white"
          >
            <X className="size-5" />
          </button>

          {images.length > 1 && (
            <span className="absolute top-4 right-4 z-10 rounded-full bg-white/90 px-3 py-1.5 text-sm font-medium text-foreground shadow-md">
              {activeIndex + 1} / {images.length}
            </span>
          )}

          <div className="relative flex h-full w-full items-center justify-center p-4 sm:p-16">
            <Image
              src={images[activeIndex]}
              alt={captionAt(activeIndex)}
              fill
              sizes="100vw"
              className="object-contain"
            />
          </div>

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={showPrev}
                aria-label="Previous photo"
                className="absolute top-1/2 left-4 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-foreground shadow-md hover:bg-white sm:size-12"
              >
                <ChevronLeft className="size-6" />
              </button>
              <button
                type="button"
                onClick={showNext}
                aria-label="Next photo"
                className="absolute top-1/2 right-4 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-foreground shadow-md hover:bg-white sm:size-12"
              >
                <ChevronRight className="size-6" />
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
