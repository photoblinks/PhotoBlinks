export const CITY_QUICK_FACT_FIELDS = [
  { key: "starting_price", label: "Starting Price", placeholder: "e.g. From ₹5,000 per shoot" },
  { key: "best_season", label: "Best Season", placeholder: "e.g. October to February" },
  { key: "best_shooting_times", label: "Best Shooting Times", placeholder: "e.g. Sunrise and golden hour" },
  { key: "costumes", label: "Costumes", placeholder: "e.g. Sarees, lehengas, western wear" },
] as const;

export type CityQuickFactKey = (typeof CITY_QUICK_FACT_FIELDS)[number]["key"];
export type CityQuickFacts = Partial<Record<CityQuickFactKey, string>>;

const MAX_LENGTH = 300;

/** Whitelists known keys and trims/limits values from any untrusted source
 * (form input or stored JSON). Unknown keys and empty values are dropped. */
export function parseCityQuickFacts(value: unknown): CityQuickFacts {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const facts: CityQuickFacts = {};
  for (const { key } of CITY_QUICK_FACT_FIELDS) {
    const text = typeof source[key] === "string" ? source[key].trim().slice(0, MAX_LENGTH) : "";
    if (text) facts[key] = text;
  }
  return facts;
}
