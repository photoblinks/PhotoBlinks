/**
 * Dropdown option sets + emoji display for the location/studio extra-detail
 * fields. Single source of truth for the admin form, the public details list,
 * and the editorial info table. Stored values are the `value` codes; a stored
 * value outside the set (legacy free text) displays as-is, without emoji.
 */

/** Price Caption shown when a location has none, and prefilled in the form. */
export const DEFAULT_PRICE_NOTE = "ℹ️ Pricing is indicative and subject to change any time.";

export type DetailOption = { value: string; label: string; emoji: string };

export const AVAILABILITY_OPTIONS: readonly DetailOption[] = [
  { value: "available", label: "Available", emoji: "🟢" },
  { value: "limited", label: "Limited", emoji: "🟡" },
  { value: "not_available", label: "Not Available", emoji: "🔴" },
];

export const ACCESS_OPTIONS: readonly DetailOption[] = [
  { value: "easy", label: "Easy", emoji: "🟢" },
  { value: "very_easy", label: "Very Easy", emoji: "🟢" },
  { value: "moderate", label: "Moderate", emoji: "🟡" },
  { value: "very_difficult", label: "Very Difficult", emoji: "🔴" },
];

export const CROWD_OPTIONS: readonly DetailOption[] = [
  { value: "low", label: "Low", emoji: "🟢" },
  { value: "moderate", label: "Moderate", emoji: "🟡" },
  { value: "high", label: "High", emoji: "🔴" },
  { value: "very_high", label: "Very High", emoji: "🔴" },
];

export const DETAIL_OPTIONS_BY_FIELD: Record<string, readonly DetailOption[]> = {
  parking_facility: AVAILABILITY_OPTIONS,
  changing_rooms: AVAILABILITY_OPTIONS,
  restrooms: AVAILABILITY_OPTIONS,
  access: ACCESS_OPTIONS,
  crowd: CROWD_OPTIONS,
};

export function formatOption(options: readonly DetailOption[], value: string): string {
  const option = options.find((o) => o.value === value);
  return option ? `${option.emoji} ${option.label}` : value;
}

/** Plain label without emoji — for structured data. */
export function optionLabel(options: readonly DetailOption[], value: string | null): string | null {
  if (value === null) return null;
  return options.find((o) => o.value === value)?.label ?? value;
}

function firstMatch(value: string, rules: readonly [RegExp, string][], fallback: string): string {
  const hit = rules.find(([pattern]) => pattern.test(value));
  return hit ? hit[1] : fallback;
}

const SEASON_RULES: readonly [RegExp, string][] = [
  [/winter/i, "❄️"],
  [/monsoon|rain/i, "🌧️"],
  [/summer/i, "☀️"],
  [/spring/i, "🌸"],
  [/autumn|fall/i, "🍂"],
];

const TIME_RULES: readonly [RegExp, string][] = [
  [/sunrise|dawn/i, "🌅"],
  [/sunset|golden|dusk/i, "🌇"],
  [/morning/i, "🌄"],
  [/afternoon|noon/i, "☀️"],
  [/evening/i, "🌆"],
  [/night/i, "🌙"],
];

export function formatBestSeason(value: string): string {
  return `${firstMatch(value, SEASON_RULES, "🗓️")} ${value}`;
}

export function formatBestTime(value: string): string {
  return `${firstMatch(value, TIME_RULES, "🕒")} ${value}`;
}
