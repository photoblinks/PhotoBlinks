import {
  Camera,
  Wallet,
  Heart,
  CalendarCheck,
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
  Car,
  Route,
  Waves,
  Bath,
  CloudSun,
  type LucideIcon,
} from "lucide-react";
import type { ExtraDetails } from "@/lib/public-data";
import {
  ACCESS_OPTIONS,
  AVAILABILITY_OPTIONS,
  CROWD_OPTIONS,
  formatBestSeason,
  formatBestTime,
  formatOption,
} from "@/lib/detail-options";

const DRONE_LABELS: Record<string, string> = {
  allowed: "🟢 Allowed",
  allowed_with_permission: "🟢 Allowed with Permission",
  restricted: "🟡 Restricted",
  prohibited: "🔴 Prohibited",
};

const PRE_WEDDING_SHOOT_LABELS: Record<string, string> = {
  allowed: "✅ Allowed",
  conditional: "⚠️ Conditional",
  prohibited: "❌ Prohibited",
};


/** Location-only pricing (Photoshoot Charges / Shoot Permit Fee). */
export type PricingInfo = { type: "free" | "paid" | "unknown"; price: number | null };

type Row = { icon: LucideIcon; label: string; value: string };

function buildGroups(details: ExtraDetails, pricing?: PricingInfo): { title: string; rows: Row[] }[] {
  return [
    {
      title: "Shoot Details",
      rows: [
        details.pre_wedding_shoot && {
          icon: Heart,
          label: "Pre-Wedding Shoot",
          value: PRE_WEDDING_SHOOT_LABELS[details.pre_wedding_shoot] ?? details.pre_wedding_shoot,
        },
        details.pre_wedding_shoot_condition && {
          icon: Heart,
          label: "Pre-Wedding Shoot Condition",
          value: details.pre_wedding_shoot_condition,
        },
        details.prior_booking && {
          icon: CalendarCheck,
          label: "Prior Booking",
          value: details.prior_booking,
        },
        details.drone_status && {
          icon: Drone,
          label: "Drone Status",
          value: DRONE_LABELS[details.drone_status] ?? details.drone_status,
        },
        details.drone_permission && {
          icon: Drone,
          label: "Drone Permission",
          value: details.drone_permission,
        },
        details.recommended_outfits && {
          icon: Shirt,
          label: "Recommended Outfits",
          value: details.recommended_outfits,
        },
      ].filter(Boolean) as Row[],
    },
    {
      title: "Pricing & Timing",
      rows: [
        details.entry_fee && { icon: Ticket, label: "Entry Fee", value: details.entry_fee },
        pricing && {
          icon: Camera,
          label: "Photoshoot Charges",
          value: pricing.type.charAt(0).toUpperCase() + pricing.type.slice(1),
        },
        pricing?.type === "paid" &&
          pricing.price && { icon: Wallet, label: "Shoot Permit Fee", value: `₹${pricing.price}` },
        details.vehicle_parking_fee && {
          icon: Car,
          label: "Vehicle Parking",
          value: details.vehicle_parking_fee,
        },
        details.best_season && {
          icon: Sun,
          label: "Best Season",
          value: formatBestSeason(details.best_season),
        },
        details.best_time && {
          icon: Clock,
          label: "Best Time of Day",
          value: formatBestTime(details.best_time),
        },
      ].filter(Boolean) as Row[],
    },
    {
      title: "Amenities",
      rows: [
        details.road_accessibility && {
          icon: Route,
          label: "Road Accessibility",
          value: details.road_accessibility,
        },
        details.parking_facility && {
          icon: SquareParking,
          label: "Vehicle Parking Availability",
          value: formatOption(AVAILABILITY_OPTIONS, details.parking_facility),
        },
        details.boating_available && {
          icon: Waves,
          label: "Boating Available for Shoot",
          value: details.boating_available,
        },
        details.changing_rooms && {
          icon: Shirt,
          label: "Changing Facilities",
          value: formatOption(AVAILABILITY_OPTIONS, details.changing_rooms),
        },
        details.restrooms && {
          icon: Bath,
          label: "Restrooms",
          value: formatOption(AVAILABILITY_OPTIONS, details.restrooms),
        },
        details.facilities && { icon: Sofa, label: "Facilities", value: details.facilities },
      ].filter(Boolean) as Row[],
    },
    {
      title: "Environment",
      rows: [
        details.access && {
          icon: DoorOpen,
          label: "Access Level",
          value: formatOption(ACCESS_OPTIONS, details.access),
        },
        details.crowd && {
          icon: Users,
          label: "Crowd Level",
          value: formatOption(CROWD_OPTIONS, details.crowd),
        },
        details.privacy && { icon: Lock, label: "Privacy Score", value: details.privacy },
        details.weather_lighting && {
          icon: CloudSun,
          label: "Weather & Lighting Considerations",
          value: details.weather_lighting,
        },
      ].filter(Boolean) as Row[],
    },
  ];
}

/** Whether any extra-detail field is set — use to decide whether to show
 * the "About This Location/Studio" heading at all. */
export function hasExtraDetails(details: ExtraDetails, pricing?: PricingInfo): boolean {
  return buildGroups(details, pricing).some((group) => group.rows.length > 0);
}

/** Optional extra-detail rows shared by location and studio detail pages,
 * grouped into Shoot Details, Pricing & Timing, Amenities, and Environment.
 * Renders nothing if none of the fields are set; a group is only shown if
 * at least one of its fields is set. */
export function ExtraDetailsList({
  details,
  pricing,
}: {
  details: ExtraDetails;
  pricing?: PricingInfo;
}) {
  const groups = buildGroups(details, pricing).filter((group) => group.rows.length > 0);

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
