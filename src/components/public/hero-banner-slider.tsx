"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

const SLIDE_INTERVAL_MS = 5000;

/** Full-bleed, auto-rotating background for the homepage hero. Cross-fades
 * between images; a single image just renders statically with no controls.
 *
 * Every slide is mounted from the initial render (server-rendered, not
 * gated behind client JS) so each banner image is a real, crawlable <img>
 * in the page's HTML. Only slide 0 — the LCP candidate — loads eagerly with
 * `priority`; the rest use next/image's default lazy loading and a low
 * fetch priority hint. All slides share `sizes="100vw"` since every slide
 * is rendered at full viewport width (see the note above the `sizes` prop
 * below for why a smaller value for slides 1-5 was tried and reverted).
 *
 * Known limitation: `loading="lazy"` on slides 1+ does not actually stop
 * the browser from fetching them on initial load. Native lazy-loading
 * defers images based on their layout distance from the viewport, and
 * every slide here is `absolute inset-0` — the exact same box as slide 0,
 * which *is* the viewport. `opacity-0` doesn't change that geometry, so
 * all six are "in viewport" as far as the browser's own heuristic is
 * concerned regardless of the `loading`/`fetchPriority` hints. Removing
 * that download entirely would mean moving the inactive slides' layout box
 * off-screen (e.g. via `transform`) until their turn, which turns this from
 * a cross-fade into a slide transition — a real visual/behavior change,
 * so that's deliberately NOT done here. Instead, the `sizes` below make
 * whatever slides 1-5 do fetch far cheaper than slide 0's candidate. */
export function HeroBannerSlider({ images }: { images: string[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (images.length <= 1) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % images.length);
    }, SLIDE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [images.length]);

  return (
    <>
      {/* Painted behind every slide (DOM order, same stacking context) so a
          slow-loading priority image shows this instead of a white flash —
          same gradient the no-banner-image fallback already uses
          (src/app/(public)/page.tsx), not a new color. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-linear-to-br from-emerald-950 via-pb-brand to-emerald-800"
      />
      {images.map((src, i) => (
        <div
          key={src}
          aria-hidden={i !== index}
          className={`absolute inset-0 transition-opacity duration-1000 ${
            i === index ? "opacity-100" : "opacity-0"
          }`}
        >
          <Image
            src={src}
            alt="Pre-wedding photoshoot location in India — PhotoBlinks"
            fill
            priority={i === 0}
            fetchPriority={i === 0 ? "high" : "low"}
            // Every slide is `absolute inset-0` on a full-bleed 100vw hero,
            // so the rendered width really is the viewport width for every
            // slide, not just slide 0. A smaller `sizes` for slides 1-5
            // (tried in an earlier pass) made the browser fetch an
            // undersized image and upscale it to fill the viewport,
            // producing visible blur once that slide rotated into view —
            // reverted back to the honest, correct value for all slides.
            sizes="100vw"
            className="object-cover"
          />
        </div>
      ))}

      {images.length > 1 && (
        <div className="absolute inset-x-0 bottom-6 z-10 flex justify-center gap-2">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              aria-label={`Show slide ${i + 1}`}
              onClick={() => setIndex(i)}
              className={`size-2 rounded-full transition-colors ${
                i === index ? "bg-white" : "bg-white/40"
              }`}
            />
          ))}
        </div>
      )}
    </>
  );
}
