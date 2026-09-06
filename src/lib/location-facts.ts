import type { DroneStatus } from "./public-data";

export type DroneFactsSummary = {
  /** Locations with a drone_status value set — never the full location
   * count, since drone_status is optional and most may have none recorded.
   * Framed as "of N with a stated policy" so the fact never implies
   * knowledge about locations that don't have this field filled in. */
  knownCount: number;
  allowedCount: number;
};

export type LocationFactsSummary = {
  count: number;
  drone: DroneFactsSummary | null;
};

/** Derives the City/State + Category "facts strip" content purely from
 * data already loaded by getPublishedLocations — no new query. Only
 * drone_status is used (see PublicLocationCard) because it's the one
 * extra-detail field structured/unambiguous enough to safely aggregate;
 * the other extra-details fields are free text and are not summarized
 * here (see Phase 10 audit). Returns null for `drone` when no location in
 * the set has the field set at all, so nothing is ever invented. */
export function summarizeLocationFacts(
  locations: { droneStatus: DroneStatus | null }[],
): LocationFactsSummary {
  const withDroneStatus = locations.filter((l) => l.droneStatus !== null);

  if (withDroneStatus.length === 0) {
    return { count: locations.length, drone: null };
  }

  const allowedCount = withDroneStatus.filter(
    (l) => l.droneStatus === "allowed" || l.droneStatus === "allowed_with_permission",
  ).length;

  return {
    count: locations.length,
    drone: { knownCount: withDroneStatus.length, allowedCount },
  };
}
