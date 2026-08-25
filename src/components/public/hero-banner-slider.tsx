"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

const SLIDE_INTERVAL_MS = 5000;

/** Full-bleed, auto-rotating background for the homepage hero. Cross-fades
 * between images; a single image just renders statically with no controls.
 *
 * Only the first slide is mounted up front (it's the LCP candidate, loaded
 * eagerly with priority). Later slides are stacked absolutely at opacity-0
 * from page load, which puts them in the viewport for the browser's lazy
 * loading heuristics regardless of opacity — so mounting all of them
 * immediately would download every slide on first paint. Instead each
 * slide only mounts the first time rotation (or a manual dot click)
 * reaches it, then stays mounted so the crossfade keeps working normally. */
export function HeroBannerSlider({ images }: { images: string[] }) {
  const [index, setIndex] = useState(0);
  const [mounted, setMounted] = useState<Set<number>>(() => new Set([0]));

  function goTo(i: number) {
    setIndex(i);
    setMounted((prev) => (prev.has(i) ? prev : new Set(prev).add(i)));
  }

  useEffect(() => {
    if (images.length <= 1) return;
    const id = setInterval(() => {
      setIndex((i) => {
        const next = (i + 1) % images.length;
        setMounted((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
        return next;
      });
    }, SLIDE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [images.length]);

  return (
    <>
      {images.map(
        (src, i) =>
          mounted.has(i) && (
            <div
              key={src}
              aria-hidden={i !== index}
              className={`absolute inset-0 transition-opacity duration-1000 ${
                i === index ? "opacity-100" : "opacity-0"
              }`}
            >
              <Image
                src={src}
                alt=""
                fill
                priority={i === 0}
                sizes="100vw"
                className="object-cover"
                unoptimized
              />
            </div>
          ),
      )}

      {images.length > 1 && (
        <div className="absolute inset-x-0 bottom-6 z-10 flex justify-center gap-2">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              aria-label={`Show slide ${i + 1}`}
              onClick={() => goTo(i)}
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
