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
 * fetch priority hint so stacking every slide doesn't force them all to
 * download on first paint. */
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
