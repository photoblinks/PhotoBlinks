"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Map, { Marker, NavigationControl, Popup, type MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { Maximize2, Minimize2 } from "lucide-react";
import { LocationPopupCard } from "@/components/public/location-popup-card";
import { getCategoryMarkerStyle } from "@/lib/category-style";
import type { MapLocation } from "@/lib/public-data";
import { loadMapLocations } from "@/app/(public)/locations/map/actions";
import type { MapFilterParams } from "@/app/(public)/locations/map/map-filters";

const DEFAULT_VIEW = { longitude: 76.3, latitude: 11.5, zoom: 6.2 };
const VIEWPORT_RELOAD_DELAY_MS = 400;

/** `locations`/`total` are the server-rendered initial set (capped); the map
 * then reloads markers for the visible viewport as it loads and moves. */
export function LocationsMap({
  locations,
  total,
  filterParams,
}: {
  locations: MapLocation[];
  total: number;
  filterParams: MapFilterParams;
}) {
  const [markers, setMarkers] = useState(locations);
  const [inViewTotal, setInViewTotal] = useState(total);
  const [selected, setSelected] = useState<MapLocation | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapRef>(null);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reloadSeq = useRef(0);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(
    () => () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
    },
    [],
  );

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current?.requestFullscreen();
    }
  }

  function scheduleViewportReload(delay: number) {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(async () => {
      const bounds = mapRef.current?.getBounds();
      if (!bounds) return;
      const seq = ++reloadSeq.current;
      const result = await loadMapLocations(filterParams, {
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
      });
      // Ignore a response that a newer pan/zoom has already superseded.
      if (seq !== reloadSeq.current) return;
      setMarkers(result.locations);
      setInViewTotal(result.total);
    }, delay);
  }

  const initialViewState = useMemo(() => {
    if (locations.length === 0) return DEFAULT_VIEW;
    const avgLat = locations.reduce((sum, l) => sum + l.latitude, 0) / locations.length;
    const avgLng = locations.reduce((sum, l) => sum + l.longitude, 0) / locations.length;
    return { longitude: avgLng, latitude: avgLat, zoom: total === 1 ? 11 : 6.5 };
  }, [locations, total]);

  if (!token) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Map is not configured.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full w-full bg-background">
      <Map
        ref={mapRef}
        mapboxAccessToken={token}
        initialViewState={initialViewState}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        style={{ width: "100%", height: "100%" }}
        onLoad={() => scheduleViewportReload(0)}
        onMoveEnd={() => scheduleViewportReload(VIEWPORT_RELOAD_DELAY_MS)}
      >
        <NavigationControl position="bottom-right" showCompass={false} />
        {markers.map((location) => {
          const { color, icon: Icon } = getCategoryMarkerStyle(location.category?.slug);
          return (
            <Marker
              key={location.slug}
              longitude={location.longitude}
              latitude={location.latitude}
              anchor="bottom"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                setSelected(location);
              }}
            >
              <button
                type="button"
                aria-label={location.name}
                style={{ backgroundColor: color }}
                className="flex size-8 cursor-pointer items-center justify-center rounded-full border-2 border-white text-white shadow-md"
              >
                <Icon className="size-4" strokeWidth={2} />
              </button>
            </Marker>
          );
        })}

        {selected && (
          <Popup
            longitude={selected.longitude}
            latitude={selected.latitude}
            anchor="top"
            onClose={() => setSelected(null)}
            closeOnClick={false}
          >
            <LocationPopupCard location={selected} />
          </Popup>
        )}
      </Map>

      {inViewTotal > markers.length && (
        <p className="absolute top-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-xs font-medium shadow-md">
          Showing {markers.length} of {inViewTotal} locations in this area — zoom in to see more
        </p>
      )}

      <button
        type="button"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? "Exit fullscreen" : "View fullscreen"}
        className="absolute top-4 right-4 z-10 flex size-9 items-center justify-center rounded-full bg-white text-foreground shadow-md hover:bg-muted"
      >
        {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
      </button>
    </div>
  );
}
