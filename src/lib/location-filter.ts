// Client-safe filtering/grouping helpers for the location directory pages.
// Kept separate from public-data.ts (which is `server-only`) so the same
// filter semantics used by getPublishedLocations' server query can be
// replayed against an already-fetched location list on the client, without
// pulling any Supabase/server code into the client bundle.
//
// These are structural duplicates of the filter logic in public-data.ts:
// server pages keep using getPublishedLocations (DB-side eq/ilike), while
// the static directory pages filter the location set they already fetched.
// The two stay in sync by hand.

import type { PublicLocationCard } from "@/lib/public-data";

export type { PublicLocationCard };

export type DroneFilterOption = "allowed" | "allowed_with_permission" | "not_allowed";

type DroneStatus = "allowed" | "allowed_with_permission" | "restricted" | "prohibited";

// Mirrors public-data.ts's droneFilterToStatus: "not_allowed" is the
// product-facing label for the stored 'prohibited' value.
export function droneFilterToStatus(filter: DroneFilterOption): DroneStatus {
  return filter === "not_allowed" ? "prohibited" : filter;
}

export type ListingFilters = {
  stateSlug?: string;
  citySlug?: string;
  categorySlug?: string;
  pricing?: "free" | "paid" | "unknown";
  drone?: DroneFilterOption;
  /** Free-text match against the location name (same field the server
   * ilike query searches). */
  search?: string;
};

/** Filters an already-fetched location list with the same semantics as the
 * server-side getPublishedLocations query (geo/category/pricing/drone are
 * equality checks, search is a case-insensitive name substring match). */
export function filterLocations(
  locations: PublicLocationCard[],
  filters: ListingFilters,
): PublicLocationCard[] {
  const search = filters.search?.trim().toLowerCase();
  const droneStatus = filters.drone ? droneFilterToStatus(filters.drone) : undefined;

  return locations.filter((location) => {
    if (filters.stateSlug && location.state?.slug !== filters.stateSlug) return false;
    if (filters.citySlug && location.city?.slug !== filters.citySlug) return false;
    if (filters.categorySlug && location.category?.slug !== filters.categorySlug) return false;
    if (filters.pricing && location.pricing_type !== filters.pricing) return false;
    if (droneStatus && location.droneStatus !== droneStatus) return false;
    if (search && !location.name.toLowerCase().includes(search)) return false;
    return true;
  });
}

/** Groups locations by category slug, dropping any without a category —
 * the same pure helper as public-data.ts's groupLocationsByCategory, moved
 * here so client components can use it without importing `server-only`. */
export function groupLocationsByCategory(locations: PublicLocationCard[]) {
  const grouped = new Map<string, PublicLocationCard[]>();
  for (const location of locations) {
    const slug = location.category?.slug;
    if (!slug) continue;
    if (!grouped.has(slug)) grouped.set(slug, []);
    grouped.get(slug)!.push(location);
  }
  return grouped;
}
