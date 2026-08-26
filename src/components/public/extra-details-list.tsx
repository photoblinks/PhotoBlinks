import { Drone, Ticket, Sun, Clock, Users, DoorOpen, Lock, type LucideIcon } from "lucide-react";
import type { ExtraDetails } from "@/lib/public-data";

const DRONE_LABELS: Record<string, string> = {
  allowed: "Allowed",
  restricted: "Restricted",
  conditional: "Conditional",
};

/** Optional extra-detail rows (drone policy, entry fee, best season/time,
 * crowd, access, privacy) shared by location and studio detail pages.
 * Renders nothing if none of the fields are set. */
export function ExtraDetailsList({ details }: { details: ExtraDetails }) {
  const rows = [
    details.drone_status && {
      icon: Drone,
      label: "Drone Status",
      value: DRONE_LABELS[details.drone_status] ?? details.drone_status,
    },
    details.entry_fee && { icon: Ticket, label: "Entry Fee", value: details.entry_fee },
    details.best_season && { icon: Sun, label: "Best Season", value: details.best_season },
    details.best_time && { icon: Clock, label: "Best Time", value: details.best_time },
    details.crowd && { icon: Users, label: "Crowd", value: details.crowd },
    details.access && { icon: DoorOpen, label: "Access", value: details.access },
    details.privacy && { icon: Lock, label: "Privacy", value: details.privacy },
  ].filter(Boolean) as { icon: LucideIcon; label: string; value: string }[];

  if (rows.length === 0) return null;

  return (
    <dl className="mt-5 flex flex-col gap-2.5 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-3">
          <row.icon className="size-4 shrink-0 text-muted-foreground" />
          <dt className="w-24 shrink-0 text-muted-foreground">{row.label}</dt>
          <dd className="font-medium">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
