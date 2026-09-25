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
  Car,
  Route,
  Waves,
  Bath,
  CloudSun,
  type LucideIcon,
} from "lucide-react";

/**
 * Canonical registry of the location information-table fields — the single
 * source of truth for field code, label, group, icon, and enum value
 * transformation. Extracted from the existing hardcoded definitions in
 * src/components/public/extra-details-list.tsx (buildGroups) and
 * src/components/admin/extra-detail-fields.tsx, so the editorial
 * information table renders the exact same field set with the exact same
 * labels/groups/transforms as the location detail page.
 *
 * The approved field set is the repository's EXTRA_DETAIL_COLUMNS /
 * ExtraDetails set (src/lib/public-data.ts). No new location fields are
 * invented here.
 */

export const LOCATION_INFO_FIELD_GROUPS = [
  "Shoot Details",
  "Pricing & Timing",
  "Amenities",
  "Environment",
] as const;

export type LocationInfoField = {
  code: string;
  label: string;
  group: (typeof LOCATION_INFO_FIELD_GROUPS)[number];
  icon: LucideIcon;
};

export const LOCATION_INFO_FIELDS: LocationInfoField[] = [
  // Shoot Details
  { code: "pre_wedding_shoot", label: "Pre-Wedding Shoot", group: "Shoot Details", icon: Heart },
  { code: "pre_wedding_shoot_condition", label: "Pre-Wedding Shoot Condition", group: "Shoot Details", icon: Heart },
  { code: "prior_booking", label: "Prior Booking", group: "Shoot Details", icon: CalendarCheck },
  { code: "drone_status", label: "Drone Status", group: "Shoot Details", icon: Drone },
  { code: "drone_permission", label: "Drone Permission", group: "Shoot Details", icon: Drone },
  { code: "recommended_outfits", label: "Recommended Outfits", group: "Shoot Details", icon: Shirt },
  // Pricing & Timing
  { code: "entry_fee", label: "Entry Fee", group: "Pricing & Timing", icon: Ticket },
  { code: "shoot_permit_fee", label: "Shoot/Permit Info", group: "Pricing & Timing", icon: Camera },
  { code: "vehicle_parking_fee", label: "Vehicle Parking", group: "Pricing & Timing", icon: Car },
  { code: "best_season", label: "Best Season", group: "Pricing & Timing", icon: Sun },
  { code: "best_time", label: "Best Time of Day", group: "Pricing & Timing", icon: Clock },
  // Amenities
  { code: "road_accessibility", label: "Road Accessibility", group: "Amenities", icon: Route },
  { code: "parking_facility", label: "Vehicle Parking Availability", group: "Amenities", icon: SquareParking },
  { code: "boating_available", label: "Boating Available for Shoot", group: "Amenities", icon: Waves },
  { code: "changing_rooms", label: "Changing Facilities", group: "Amenities", icon: Shirt },
  { code: "restrooms", label: "Restrooms", group: "Amenities", icon: Bath },
  { code: "facilities", label: "Facilities", group: "Amenities", icon: Sofa },
  // Environment
  { code: "access", label: "Access Level", group: "Environment", icon: DoorOpen },
  { code: "crowd", label: "Crowd Level", group: "Environment", icon: Users },
  { code: "privacy", label: "Privacy Score", group: "Environment", icon: Lock },
  { code: "weather_lighting", label: "Weather & Lighting Considerations", group: "Environment", icon: CloudSun },
];

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

const AVAILABILITY_LABELS: Record<string, string> = {
  available: "Available",
  not_available: "Not Available",
};

/** Maps a stored enum value to its display label; free-text fields pass
 * through unchanged. Mirrors the label maps in extra-details-list.tsx. */
export function formatLocationInfoValue(code: string, value: string | null): string {
  if (value == null) return "";
  switch (code) {
    case "drone_status":
      return DRONE_LABELS[value] ?? value;
    case "pre_wedding_shoot":
      return PRE_WEDDING_SHOOT_LABELS[value] ?? value;
    case "parking_facility":
    case "changing_rooms":
      return AVAILABILITY_LABELS[value] ?? value;
    default:
      return value;
  }
}

/** Admin configuration for which approved fields appear in the editorial
 * location information tables. Stored as a single JSONB column on
 * site_settings (see getLocationInfoTableConfig in public-data.ts). An
 * absent/empty config means canonical behavior (all fields, canonical
 * order, canonical labels). */
export type LocationInfoTableConfig = {
  enabled?: string[];
  order?: string[];
  labels?: Record<string, string>;
};

/** Resolves the canonical registry against a config: enabled filters which
 * fields appear (absent = all), order reorders them (fields not listed keep
 * their canonical relative order), and unknown codes are ignored so a
 * malformed config fails closed to canonical behavior. */
export function getEnabledLocationInfoFields(config: LocationInfoTableConfig): LocationInfoField[] {
  let fields = LOCATION_INFO_FIELDS;

  // `enabled !== undefined` (rather than a length check) distinguishes "no
  // config" (all fields) from an explicitly empty list (no fields) — an
  // admin may legitimately disable every field.
  if (config.enabled !== undefined) {
    const enabled = new Set(config.enabled);
    fields = fields.filter((field) => enabled.has(field.code));
  }

  if (config.order && config.order.length > 0) {
    const index = new Map(config.order.map((code, i) => [code, i]));
    fields = [...fields].sort((a, b) => {
      const ai = index.get(a.code);
      const bi = index.get(b.code);
      if (ai === undefined && bi === undefined) return 0;
      if (ai === undefined) return 1;
      if (bi === undefined) return -1;
      return ai - bi;
    });
  }

  return fields;
}

/** Resolves a field's display label, applying a configured override when
 * present. */
export function getLocationInfoFieldLabel(field: LocationInfoField, config: LocationInfoTableConfig): string {
  const override = config.labels?.[field.code];
  return override && override.trim().length > 0 ? override : field.label;
}
