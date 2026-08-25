"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatDistanceKm, haversineDistanceKm } from "@/lib/geo";

export function DistanceDisplay({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}) {
  const [state, setState] = useState<
    { status: "idle" } | { status: "loading" } | { status: "error"; message: string } | { status: "done"; km: number }
  >({ status: "idle" });

  function requestDistance() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({ status: "error", message: "Location isn't available in this browser." });
      return;
    }

    setState({ status: "loading" });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const km = haversineDistanceKm(
          { latitude, longitude },
          { latitude: position.coords.latitude, longitude: position.coords.longitude },
        );
        setState({ status: "done", km });
      },
      () => {
        setState({ status: "error", message: "Location permission was denied." });
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }

  if (state.status === "idle") {
    return (
      <Button type="button" variant="outline" size="sm" onClick={requestDistance}>
        Show distance from me
      </Button>
    );
  }

  if (state.status === "loading") {
    return <p className="text-sm text-muted-foreground">Getting your location…</p>;
  }

  if (state.status === "error") {
    return <p className="text-sm text-muted-foreground">{state.message}</p>;
  }

  return <p className="text-sm font-medium">{formatDistanceKm(state.km)}</p>;
}
