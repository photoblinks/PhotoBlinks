import {
  Heart,
  CalendarCheck,
  Camera,
  Drone,
  Ticket,
  Sun,
  Clock,
  Shirt,
  SquareParking,
  Sofa,
  DoorOpen,
  Users,
  Lock,
  type LucideIcon,
} from "lucide-react";
import type { ExtraDetails } from "@/lib/public-data";

const DRONE_LABELS: Record<string, string> = {
  allowed: "🟢 Allowed",
  allowed_with_permission: "🟢 Allowed with Permission",
  restricted: "🟡 Restricted",
  prohibited: "🔴 Prohibited",
};

const AVAILABILITY_LABELS: Record<string, string> = {
  available: "Available",
  not_available: "Not Available",
};

type Row = { icon: LucideIcon; label: string; value: string };

function buildGroups(details: ExtraDetails): { title: string; rows: Row[] }[] {
  return [
    {
      title: "Shoot Details",
      rows: [
        details.pre_wedding_shoot && {
          icon: Heart,
          label: "Pre-Wedding Shoot",
          value: details.pre_wedding_shoot,
        },
        details.prior_booking && {
          icon: CalendarCheck,
          label: "Prior Booking",
          value: details.prior_booking,
        },
        details.camera_charges && {
          icon: Camera,
          label: "Camera Charges",
          value: details.camera_charges,
        },
        details.drone_status && {
          icon: Drone,
          label: "Drone Status",
          value: DRONE_LABELS[details.drone_status] ?? details.drone_status,
        },
      ].filter(Boolean) as Row[],
    },
    {
      title: "Pricing & Timing",
      rows: [
        details.entry_fee && { icon: Ticket, label: "Entry Fee", value: details.entry_fee },
        details.best_season && { icon: Sun, label: "Best Season", value: details.best_season },
        details.best_time && { icon: Clock, label: "Best Time", value: details.best_time },
      ].filter(Boolean) as Row[],
    },
    {
      title: "Amenities",
      rows: [
        details.changing_rooms && {
          icon: Shirt,
          label: "Changing Rooms",
          value: AVAILABILITY_LABELS[details.changing_rooms] ?? details.changing_rooms,
        },
        details.parking_facility && {
          icon: SquareParking,
          label: "Parking Facility",
          value: AVAILABILITY_LABELS[details.parking_facility] ?? details.parking_facility,
        },
        details.facilities && { icon: Sofa, label: "Facilities", value: details.facilities },
      ].filter(Boolean) as Row[],
    },
    {
      title: "Environment",
      rows: [
        details.access && { icon: DoorOpen, label: "Access", value: details.access },
        details.crowd && { icon: Users, label: "Crowd", value: details.crowd },
        details.privacy && { icon: Lock, label: "Privacy", value: details.privacy },
      ].filter(Boolean) as Row[],
    },
  ];
}

/** Whether any extra-detail field is set — use to decide whether to show
 * the "About This Location/Studio" heading at all. */
export function hasExtraDetails(details: ExtraDetails): boolean {
  return buildGroups(details).some((group) => group.rows.length > 0);
}

/** Optional extra-detail rows shared by location and studio detail pages,
 * grouped into Shoot Details, Pricing & Timing, Amenities, and Environment.
 * Renders nothing if none of the fields are set; a group is only shown if
 * at least one of its fields is set. */
export function ExtraDetailsList({ details }: { details: ExtraDetails }) {
  const groups = buildGroups(details).filter((group) => group.rows.length > 0);

  if (groups.length === 0) return null;

  return (
    <>
      {/* Phone: stacked, grouped under a heading. */}
      <div className="flex flex-col gap-5 sm:hidden">
        {groups.map((group) => (
          <div key={group.title}>
            <h3 className="mb-2 text-sm font-semibold text-foreground">{group.title}</h3>
            <dl className="flex flex-col gap-2.5 text-sm">
              {group.rows.map((row) => (
                <div key={row.label} className="flex items-center gap-3">
                  <row.icon className="size-4 shrink-0 text-muted-foreground" />
                  <dt className="w-32 shrink-0 text-muted-foreground">{row.label}</dt>
                  <dd className="font-medium">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      {/* Tablet/desktop: category | field | value table, category spans
          its group's rows. */}
      <table className="hidden w-full border-collapse text-sm sm:table">
        <tbody>
          {groups.map((group, groupIndex) => {
            // Extra breathing room above/below the divider line that
            // separates categories — not just between rows in the same
            // category.
            const topPad = groupIndex === 0 ? "pt-1.5" : "pt-3";
            const bottomPad = groupIndex === groups.length - 1 ? "pb-1.5" : "pb-3";

            return group.rows.map((row, i) => {
              const isFirstOfGroup = i === 0;
              const isLastOfGroup = i === group.rows.length - 1;
              const rowTopPad = isFirstOfGroup ? topPad : "pt-1.5";
              const rowBottomPad = isLastOfGroup ? bottomPad : "pb-1.5";

              return (
                <tr key={row.label}>
                  {isFirstOfGroup && (
                    <td
                      rowSpan={group.rows.length}
                      className={`w-36 ${topPad} ${bottomPad} pr-4 align-top font-semibold`}
                    >
                      {group.title}
                    </td>
                  )}
                  <td
                    className={`w-40 ${rowTopPad} ${rowBottomPad} pr-4 align-middle text-muted-foreground`}
                  >
                    <span className="flex items-center gap-2">
                      <row.icon className="size-4 shrink-0" />
                      {row.label}
                    </span>
                  </td>
                  <td className={`${rowTopPad} ${rowBottomPad} align-middle font-medium`}>
                    {row.value}
                  </td>
                </tr>
              );
            });
          })}
        </tbody>
      </table>
    </>
  );
}
