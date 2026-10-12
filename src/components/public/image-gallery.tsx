"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Images, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  GALLERY_PRIMARY_IMAGE_WIDTH,
  GALLERY_SUPPORTING_IMAGE_WIDTH,
  LIGHTBOX_IMAGE_WIDTH,
  toTransformUrl,
} from "@/lib/cf-image-loader";

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
          Every photo opens the full-size, scrollable lightbox when clicked.

          Every image below is pre-transformed at a fixed width through
          toTransformUrl() and rendered with `unoptimized`, so next/image
          emits a single Cloudflare transform URL instead of a multi-width
          srcset (each srcset candidate is a distinct transformation variant
          and would burn the transformation quota). The `sizes` attributes
          are retained only as documentation of the real rendered widths the
          fixed widths were chosen for; they no longer drive srcset. */}
      <div className="flex flex-col gap-2 sm:h-[420px] sm:flex-row lg:h-[480px]">
        <button
          type="button"
          onClick={() => openLightbox(0)}
          aria-label={`View ${alt} photos`}
          className="relative aspect-4/3 shrink-0 overflow-hidden rounded-xl bg-muted sm:aspect-auto sm:h-full sm:w-[55%]"
        >
          <Image
            src={toTransformUrl(primary, GALLERY_PRIMARY_IMAGE_WIDTH)}
            alt={captionAt(0)}
            fill
            priority
            unoptimized
            sizes="(min-width: 1280px) 678px, (min-width: 640px) 55vw, 100vw"
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
                  src={toTransformUrl(supporting[0], GALLERY_SUPPORTING_IMAGE_WIDTH)}
                  alt={captionAt(1)}
                  fill
                  unoptimized
                  sizes="(min-width: 1280px) 547px, (min-width: 640px) 45vw, 50vw"
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
                  src={toTransformUrl(supporting[1], GALLERY_SUPPORTING_IMAGE_WIDTH)}
                  alt={captionAt(2)}
                  fill
                  unoptimized
                  sizes="(min-width: 1280px) 547px, (min-width: 640px) 45vw, 50vw"
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
                      src={toTransformUrl(supporting[2], GALLERY_SUPPORTING_IMAGE_WIDTH)}
                      alt={captionAt(3)}
                      fill
                      unoptimized
                      sizes="(min-width: 1280px) 270px, (min-width: 640px) 22vw, 50vw"
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
                      src={toTransformUrl(supporting[3], GALLERY_SUPPORTING_IMAGE_WIDTH)}
                      alt={captionAt(4)}
                      fill
                      unoptimized
                      sizes="(min-width: 1280px) 270px, (min-width: 640px) 22vw, 50vw"
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

          {/* Full-screen view: the `fill` image is absolutely positioned to
              the dialog's padding box, so the element spans the entire
              viewport despite the wrapper's p-4/sm:p-16. It renders at a
              fixed 1920px transform (`unoptimized`, single URL). Note
              Cloudflare's default fit is scale-down, so a large request
              can't stretch a small original. `sizes="100vw"` is retained
              only as documentation of the rendered width. */}
          <div className="relative flex h-full w-full items-center justify-center p-4 sm:p-16">
            <Image
              src={toTransformUrl(images[activeIndex], LIGHTBOX_IMAGE_WIDTH)}
              alt={captionAt(activeIndex)}
              fill
              unoptimized
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
