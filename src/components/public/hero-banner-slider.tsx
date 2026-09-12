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
 * fetch priority hint, plus a much smaller `sizes` (see below).
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
            // next/image's srcSet always spans every configured width
            // (640-3840px, see next.config.ts) whenever `sizes` contains a
            // "vw" token — the srcSet stays fully responsive either way;
            // `sizes` only changes which candidate the BROWSER picks for
            // the current viewport (see next/image's getWidths(), which
            // parses "vw" out of `sizes` to build that list — a plain
            // pixel token like "360px" is ignored for that purpose).
            //
            // Slide 0 (the LCP candidate): with the old `sizes="100vw"`,
            // a ~360-412px mobile viewport at a real device pixel ratio
            // made the browser select the 750px candidate (viewport × DPR
            // lands past the 640 breakpoint). Below the md breakpoint this
            // now tells the browser the image occupies 360 CSS px instead
            // of the true full-bleed width — a deliberate, slightly-softer-
            // on-very-high-DPR trade-off for this one above-the-fold image
            // (the same technique web.dev recommends for full-bleed
            // hero/background photos), enough headroom to land on the 640
            // candidate at typical mobile DPRs. Desktop (`100vw` past
            // 767px) is unaffected.
            //
            // Slides 1-5: never the LCP image and, per the note above,
            // still get fetched despite being lazy/low-priority — so make
            // whatever does get fetched far smaller. A fixed 384px (no
            // "vw") is a real, non-viewport-relative slot size: it fetches
            // ~384px at 1x DPR and scales up modestly on higher-DPR
            // screens, always well below slide 0's candidate at the same
            // DPR (e.g. ~1200px vs slide 0's ~1920-3840px at 3x on
            // desktop-width viewports).
            sizes={i === 0 ? "(max-width: 767px) 360px, 100vw" : "384px"}
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
