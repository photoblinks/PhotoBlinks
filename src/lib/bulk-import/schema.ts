/**
 * Single source of truth for the Bulk Location Excel Import contract.
 *
 * The official template generator (template.ts) and the Phase 3
 * parser/validator must both consume these definitions so the workbook an
 * employee fills in can never drift from the workbook the importer reads.
 * Column order, header text, required/conditional rules, and the controlled
 * dropdown value sets all live here — nowhere else.
 *
 * The approved 28 columns are a bulk version of the existing location form
 * (src/app/admin/(shell)/locations/actions.ts locationSchema). No new
 * location fields are invented here; each `key` is the exact column/field
 * code the location form already persists.
 */

import {
  ACCESS_OPTIONS,
  AVAILABILITY_OPTIONS as DETAIL_AVAILABILITY_OPTIONS,
  CROWD_OPTIONS,
  type DetailOption,
} from "@/lib/detail-options";

export const BULK_IMPORT_VERSION = "1.0";

/** The Locations sheet header row (1-based) and first data row. Phase 3's
 * parser must read headers from HEADER_ROW and rows from DATA_START_ROW, so
 * these are part of the contract, not template-only details. */
export const BULK_IMPORT_HEADER_ROW = 1;
export const BULK_IMPORT_DATA_START_ROW = 2;

/** A controlled dropdown option: `value` is the stored/parsed code, `label`
 * is the exact text shown in the Excel dropdown and Reference Data sheet. */
export type EnumOption = {
  value: string;
  label: string;
};

export const PRICING_OPTIONS: readonly EnumOption[] = [
  { value: "free", label: "Free" },
  { value: "paid", label: "Paid" },
  { value: "unknown", label: "Unknown" },
];

export const PRE_WEDDING_SHOOT_OPTIONS: readonly EnumOption[] = [
  { value: "allowed", label: "Allowed" },
  { value: "conditional", label: "Conditional" },
  { value: "prohibited", label: "Prohibited" },
];

export const DRONE_STATUS_OPTIONS: readonly EnumOption[] = [
  { value: "allowed", label: "Allowed" },
  { value: "allowed_with_permission", label: "Allowed with Permission" },
  { value: "restricted", label: "Restricted" },
  { value: "prohibited", label: "Prohibited" },
];

const plain = (options: readonly DetailOption[]): readonly EnumOption[] =>
  options.map(({ value, label }) => ({ value, label }));

export const AVAILABILITY_OPTIONS = plain(DETAIL_AVAILABILITY_OPTIONS);

/** Controlled value sets referenced by the enum columns below. */
export const BULK_IMPORT_ENUMS = {
  pricing: PRICING_OPTIONS,
  pre_wedding_shoot: PRE_WEDDING_SHOOT_OPTIONS,
  drone_status: DRONE_STATUS_OPTIONS,
  availability: AVAILABILITY_OPTIONS,
  access: plain(ACCESS_OPTIONS),
  crowd: plain(CROWD_OPTIONS),
} as const;

export type BulkImportEnumKey = keyof typeof BULK_IMPORT_ENUMS;

export type BulkImportColumnType = "text" | "multiline" | "number" | "enum" | "category";

export type BulkImportColumnCondition = {
  /** Column key this field depends on. */
  dependsOn: string;
  /** Display values of the controlling column that trigger this field. */
  whenValues: readonly string[];
  note: string;
};

export type BulkImportColumn = {
  /** Canonical DB field code — the stable key Phase 3's parser maps to. */
  key: string;
  /** Exact Excel header text (the approved contract name). */
  label: string;
  type: BulkImportColumnType;
  required: boolean;
  /** For `type: "enum"` — the controlled value set that drives the dropdown. */
  enumKey?: BulkImportEnumKey;
  /** For conditional / conditionally-required columns. */
  condition?: BulkImportColumnCondition;
  /** Short helper shown on the Instructions sheet. */
  note?: string;
  /** Suggested column width (Excel character units). */
  width: number;
};

/** The 28 approved import columns, in the exact approved order. Country and
 * State are deliberately absent — they come from the dashboard selection and
 * apply to every imported row. */
export const BULK_IMPORT_COLUMNS: readonly BulkImportColumn[] = [
  { key: "name", label: "Location Name", type: "text", required: true, width: 26 },
  { key: "card_name", label: "Card Place Name", type: "text", required: true, width: 22 },
  { key: "city_name", label: "City", type: "text", required: true, width: 18 },
  {
    key: "category_id",
    label: "Category",
    type: "category",
    required: true,
    width: 18,
    note: "Pick from the dropdown — current active categories only.",
  },
  {
    key: "description",
    label: "Description",
    type: "multiline",
    required: false,
    width: 60,
    note: "Multiline text is fine — text wrapping is enabled on this column.",
  },
  { key: "pricing_type", label: "Pricing", type: "enum", enumKey: "pricing", required: true, width: 12 },
  {
    key: "price",
    label: "Price",
    type: "number",
    required: false,
    width: 12,
    condition: { dependsOn: "pricing_type", whenValues: ["Paid"], note: "Required when Pricing = Paid." },
  },
  { key: "recommended_outfits", label: "Recommended Outfits", type: "text", required: false, width: 24 },
  {
    key: "pre_wedding_shoot",
    label: "Pre-Wedding Shoot",
    type: "enum",
    enumKey: "pre_wedding_shoot",
    required: false,
    width: 18,
  },
  {
    key: "pre_wedding_shoot_condition",
    label: "Pre-Wedding Shoot Condition",
    type: "text",
    required: false,
    width: 28,
    condition: {
      dependsOn: "pre_wedding_shoot",
      whenValues: ["Conditional"],
      note: "Fill when Pre-Wedding Shoot = Conditional.",
    },
  },
  { key: "prior_booking", label: "Prior Booking", type: "text", required: false, width: 20 },
  {
    key: "drone_status",
    label: "Drone Status",
    type: "enum",
    enumKey: "drone_status",
    required: false,
    width: 20,
  },
  {
    key: "drone_permission",
    label: "Drone Permission",
    type: "text",
    required: false,
    width: 28,
    condition: {
      dependsOn: "drone_status",
      whenValues: ["Allowed with Permission", "Restricted"],
      note: "Fill when Drone Status = Allowed with Permission or Restricted.",
    },
  },
  { key: "entry_fee", label: "Entry Fee", type: "text", required: false, width: 16 },
  { key: "shoot_permit_fee", label: "Shoot/Permit Info", type: "text", required: false, width: 22 },
  { key: "vehicle_parking_fee", label: "Vehicle Parking", type: "text", required: false, width: 20 },
  {
    key: "parking_facility",
    label: "Vehicle Parking Availability",
    type: "enum",
    enumKey: "availability",
    required: false,
    width: 24,
  },
  { key: "best_season", label: "Best Season", type: "text", required: false, width: 18 },
  { key: "best_time", label: "Best Time of Day", type: "text", required: false, width: 20 },
  { key: "road_accessibility", label: "Road Accessibility", type: "text", required: false, width: 20 },
  {
    key: "boating_available",
    label: "Boating Available for Shoot",
    type: "text",
    required: false,
    width: 24,
  },
  {
    key: "changing_rooms",
    label: "Changing Facilities",
    type: "enum",
    enumKey: "availability",
    required: false,
    width: 20,
  },
  { key: "restrooms", label: "Restrooms", type: "enum", enumKey: "availability", required: false, width: 16 },
  { key: "facilities", label: "Facilities", type: "text", required: false, width: 24 },
  { key: "access", label: "Access Level", type: "enum", enumKey: "access", required: false, width: 18 },
  { key: "crowd", label: "Crowd Level", type: "enum", enumKey: "crowd", required: false, width: 18 },
  { key: "privacy", label: "Privacy Score", type: "text", required: false, width: 18 },
  {
    key: "weather_lighting",
    label: "Weather & Lighting Considerations",
    type: "text",
    required: false,
    width: 32,
  },
];

/** Column keys whose dropdown is populated from the active categories table
 * rather than a fixed controlled set. */
export const CATEGORY_COLUMN_KEYS = BULK_IMPORT_COLUMNS.filter((c) => c.type === "category").map(
  (c) => c.key,
);
