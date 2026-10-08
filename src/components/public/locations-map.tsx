"use client";

import dynamic from "next/dynamic";

/** Mapbox GL (react-map-gl + mapbox-gl's JS and CSS) is a large,
 * client/WebGL-only library that isn't needed for the initial paint.
 * Loading the real implementation (./locations-map-inner) via next/dynamic
 * code-splits it out of the page's initial client bundle entirely; the chunk
 * (including its co-located mapbox-gl.css import) is only fetched once this
 * component actually mounts.
 *
 * `ssr: false` is required: Next.js doesn't allow dynamic imports with SSR
 * in a Server Component (the map page that renders this), so this thin
 * "use client" wrapper is what carries the option — and it's the correct
 * choice regardless, since Mapbox GL renders into a WebGL canvas that
 * needs `window`/DOM APIs unavailable during server rendering. */
export const LocationsMap = dynamic(
  () => import("./locations-map-inner").then((mod) => mod.LocationsMap),
  {
    ssr: false,
    loading: () => (
      <div className="relative h-full w-full bg-background">
        <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <div className="size-8 border-4 border-pb-brand border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium">Loading map…</p>
          </div>
        </div>
      </div>
    ),
  }
);