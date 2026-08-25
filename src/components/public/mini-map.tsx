"use client";

import Map, { Marker } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";

export function MiniMap({
  latitude,
  longitude,
  label,
}: {
  latitude: number;
  longitude: number;
  label: string;
}) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return null;

  return (
    <div className="h-64 overflow-hidden rounded-xl">
      <Map
        mapboxAccessToken={token}
        initialViewState={{ longitude, latitude, zoom: 12 }}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        scrollZoom={false}
      >
        <Marker longitude={longitude} latitude={latitude} anchor="bottom">
          <div
            aria-label={label}
            className="h-4 w-4 rounded-full border-2 border-white bg-primary shadow-md"
          />
        </Marker>
      </Map>
    </div>
  );
}
