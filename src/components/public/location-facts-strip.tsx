import { MapPin, Drone } from "lucide-react";
import type { LocationFactsSummary } from "@/lib/location-facts";

/** Compact, factual summary shown on City/State + Category pages — replaces
 * the removed generic template sentence. Every number here is a real count
 * derived from the page's own canonical published-location set (never the
 * interactive filter preview — see the callers), so it stays honest and
 * page-specific instead of templated prose. Renders nothing but the count
 * when no location has a drone_status set. */
export function LocationFactsStrip({
  facts,
  categoryName,
}: {
  facts: LocationFactsSummary;
  categoryName: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border bg-white p-4 text-sm shadow-sm">
      <span className="flex items-center gap-2 font-medium text-foreground">
        <MapPin className="size-4 shrink-0 text-pb-brand" />
        {facts.count} {categoryName} location{facts.count === 1 ? "" : "s"}
      </span>
      {facts.drone && (
        <span className="flex items-center gap-2 text-muted-foreground">
          <Drone className="size-4 shrink-0 text-pb-brand" />
          Drone shoots allowed at {facts.drone.allowedCount} of {facts.drone.knownCount} location
          {facts.drone.knownCount === 1 ? "" : "s"} with a stated drone policy
        </span>
      )}
    </div>
  );
}
