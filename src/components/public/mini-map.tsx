"use client";

import dynamic from "next/dynamic";

/** Mapbox GL (react-map-gl + mapbox-gl's JS and CSS) is a large,
 * client/WebGL-only library that isn't needed for the initial paint — the
 * map sits below the fold on location/studio detail pages. Loading the
 * real implementation (./mini-map-inner) via next/dynamic code-splits it
 * out of the page's initial client bundle entirely; the chunk (including
 * its co-located mapbox-gl.css import) is only fetched once this
 * component actually mounts.
 *
 * `ssr: false` is required here: Next.js doesn't allow it in a Server
 * Component (the two detail pages that render this), so this thin
 * "use client" wrapper is what carries the option — and it's the correct
 * choice regardless, since Mapbox GL renders into a WebGL canvas that
 * needs `window`/DOM APIs unavailable during server rendering. */
export const MiniMap = dynamic(() => import("./mini-map-inner").then((mod) => mod.MiniMap), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-xl bg-muted" />,
});
