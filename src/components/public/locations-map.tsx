"use client";

import { useMemo, useState } from "react";
import Map, { Marker, Popup } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { LocationPopupCard } from "@/components/public/location-popup-card";
import { getCategoryMarkerStyle } from "@/lib/category-style";
import type { PublicLocationCard } from "@/lib/public-data";

const DEFAULT_VIEW = { longitude: 76.3, latitude: 11.5, zoom: 6.2 };

type MappableLocation = PublicLocationCard & { latitude: number; longitude: number };

export function LocationsMap({ locations }: { locations: PublicLocationCard[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  const mappable = useMemo(
    () =>
      locations.filter(
        (l): l is MappableLocation => l.latitude != null && l.longitude != null,
      ),
    [locations],
  );

  const initialViewState = useMemo(() => {
    if (mappable.length === 0) return DEFAULT_VIEW;
    const avgLat = mappable.reduce((sum, l) => sum + l.latitude, 0) / mappable.length;
    const avgLng = mappable.reduce((sum, l) => sum + l.longitude, 0) / mappable.length;
    return { longitude: avgLng, latitude: avgLat, zoom: mappable.length === 1 ? 11 : 6.5 };
  }, [mappable]);

  const selected = mappable.find((l) => l.id === selectedId) ?? null;

  if (!token) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Map is not configured.
      </div>
    );
  }

  return (
    <Map
      key={mappable.map((l) => l.id).join(",")}
      mapboxAccessToken={token}
      initialViewState={initialViewState}
      mapStyle="mapbox://styles/mapbox/streets-v12"
      style={{ width: "100%", height: "100%" }}
    >
      {mappable.map((location) => {
        const { color, icon: Icon } = getCategoryMarkerStyle(location.category?.slug);
        return (
          <Marker
            key={location.id}
            longitude={location.longitude}
            latitude={location.latitude}
            anchor="bottom"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setSelectedId(location.id);
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
          onClose={() => setSelectedId(null)}
          closeOnClick={false}
        >
          <LocationPopupCard location={selected} />
        </Popup>
      )}
    </Map>
  );
}
