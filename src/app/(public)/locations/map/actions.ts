"use server";

import {
  getActiveCategories,
  getActiveCities,
  getActiveStates,
  getMapLocations,
  type MapBounds,
  type MapLocation,
} from "@/lib/public-data";
import { resolveMapFilters, type MapFilterParams } from "./map-filters";

const FILTER_KEYS = ["q", "state", "city", "category", "pricing", "drone", "lat", "lng"] as const;
const MAX_PARAM_LENGTH = 100;

/** Public viewport loader for the map: returns at most MAP_MAX_MARKERS
 * markers inside the requested bounds, with only marker/popup fields. All
 * input is untrusted, so it is re-validated here. */
export async function loadMapLocations(
  rawParams: MapFilterParams,
  rawBounds: MapBounds,
): Promise<{ locations: MapLocation[]; total: number }> {
  const bounds: MapBounds = {
    west: Number(rawBounds?.west),
    south: Number(rawBounds?.south),
    east: Number(rawBounds?.east),
    north: Number(rawBounds?.north),
  };
  const valid =
    Object.values(bounds).every(Number.isFinite) &&
    bounds.south >= -90 &&
    bounds.north <= 90 &&
    bounds.south <= bounds.north &&
    bounds.west >= -180 &&
    bounds.east <= 180 &&
    bounds.west <= bounds.east;
  if (!valid) return { locations: [], total: 0 };

  const params: MapFilterParams = {};
  for (const key of FILTER_KEYS) {
    const value = rawParams?.[key];
    if (typeof value === "string") params[key] = value.slice(0, MAX_PARAM_LENGTH);
  }

  const [states, cities, categories] = await Promise.all([
    getActiveStates(),
    getActiveCities(),
    getActiveCategories(),
  ]);
  return getMapLocations(resolveMapFilters(params, { states, cities, categories }), bounds);
}
