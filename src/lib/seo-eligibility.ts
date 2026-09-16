/** Single source of truth for the "is this geo + category combination worth
 * indexing" rule. A combination with 0 published locations has no page at
 * all (404); below the threshold the page can still render for
 * product/UX reasons but stays out of the sitemap and is marked noindex;
 * at/above the threshold it's fully indexable and sitemap-eligible.
 *
 * Only takes a published-location count — not a DB call — so the same rule
 * can be reused for city+category (today), and later state+category /
 * country+category, without duplicating the threshold anywhere. */
export const SEO_ELIGIBLE_LOCATION_THRESHOLD = 5;

export function isSeoEligible(publishedLocationCount: number): boolean {
  return publishedLocationCount >= SEO_ELIGIBLE_LOCATION_THRESHOLD;
}

/** Short operator-facing label for the admin inventory — how many more
 * published locations a combination needs before it becomes SEO eligible. */
export function seoEligibilityLabel(publishedLocationCount: number): string {
  if (isSeoEligible(publishedLocationCount)) return "SEO Eligible";
  const remaining = SEO_ELIGIBLE_LOCATION_THRESHOLD - publishedLocationCount;
  return `Needs ${remaining} more`;
}

/** True when any of the given search/filter query values is non-empty.
 * Used to noindex (but still follow) query-parameter variants of an
 * aggregation page — e.g. `?category=beach` or `?q=goa` — that are not
 * meant to be standalone SEO landing pages. Only pass the keys that are
 * genuine filter/search parameters for the route calling this; pagination
 * or other non-filtering params must be excluded by the caller. The clean
 * base URL (no query params) keeps its normal isSeoEligible-based
 * indexability — this only ever adds a noindex on top, never removes one. */
export function hasIndexAffectingParams(query: Record<string, string | undefined>): boolean {
  return Object.values(query).some((value) => typeof value === "string" && value.trim() !== "");
}

type GeoGroupableLocation = {
  country: { name: string; slug: string } | null;
  state: { name: string; slug: string } | null;
  city: { name: string; slug: string } | null;
  category: { name: string; slug: string } | null;
  updatedAt: string;
};

/** One geographic/category aggregation bucket — a country, a state, a city,
 * a nationwide category, a city+category, or a state+category combination —
 * with its published-location count and whether it clears
 * SEO_ELIGIBLE_LOCATION_THRESHOLD. Never describes an individual location
 * page, which is never gated by this threshold (see module docstring). */
export type SeoGeoGroup = {
  /** Slug path segment(s), e.g. "in/karnataka/bengaluru" for a city, or
   * just "beach" for a nationwide category. */
  path: string;
  /** Display names in the same order as `path`'s segments. */
  names: string[];
  count: number;
  eligible: boolean;
  lastModified: string;
};

type MutableGroup = { path: string; names: string[]; dates: string[] };

function upsertGroup(map: Map<string, MutableGroup>, key: string, path: string, names: string[], date: string) {
  const existing = map.get(key);
  if (existing) {
    existing.dates.push(date);
  } else {
    map.set(key, { path, names, dates: [date] });
  }
}

function finalizeGroups(map: Map<string, MutableGroup>): SeoGeoGroup[] {
  return [...map.values()].map((group) => ({
    path: group.path,
    names: group.names,
    count: group.dates.length,
    eligible: isSeoEligible(group.dates.length),
    lastModified: group.dates.reduce((max, d) => (d > max ? d : max), group.dates[0]),
  }));
}

/** Single source of truth for which geographic/category aggregation pages
 * (country, state, city, nationwide category, city+category, state+category)
 * clear the 5-published-location threshold — groups the given published
 * locations into those buckets and computes each bucket's count + eligibility
 * exactly once. Shared by sitemap.ts and the /llms.txt + /llms-full.txt
 * routes so the "is this aggregation page worth indexing/promoting" answer
 * never has a second definition.
 *
 * Deliberately NOT used to gate individual location pages — those are always
 * eligible when published, regardless of how many sibling locations exist in
 * the same city/state/country/category. */
export function buildLocationGeoGroups(locations: GeoGroupableLocation[]) {
  const countries = new Map<string, MutableGroup>();
  const states = new Map<string, MutableGroup>();
  const cities = new Map<string, MutableGroup>();
  const categories = new Map<string, MutableGroup>();
  const cityCategories = new Map<string, MutableGroup>();
  const stateCategories = new Map<string, MutableGroup>();

  for (const location of locations) {
    if (location.category) {
      upsertGroup(
        categories,
        location.category.slug,
        location.category.slug,
        [location.category.name],
        location.updatedAt,
      );
    }

    if (!location.country || !location.state) continue;
    const countryKey = location.country.slug;
    upsertGroup(countries, countryKey, countryKey, [location.country.name], location.updatedAt);

    const stateKey = `${countryKey}/${location.state.slug}`;
    upsertGroup(states, stateKey, stateKey, [location.country.name, location.state.name], location.updatedAt);

    if (location.category) {
      const stateCategoryKey = `${stateKey}/${location.category.slug}`;
      upsertGroup(
        stateCategories,
        stateCategoryKey,
        stateCategoryKey,
        [location.country.name, location.state.name, location.category.name],
        location.updatedAt,
      );
    }

    if (location.city) {
      const cityKey = `${stateKey}/${location.city.slug}`;
      upsertGroup(
        cities,
        cityKey,
        cityKey,
        [location.country.name, location.state.name, location.city.name],
        location.updatedAt,
      );

      if (location.category) {
        const cityCategoryKey = `${cityKey}/${location.category.slug}`;
        upsertGroup(
          cityCategories,
          cityCategoryKey,
          cityCategoryKey,
          [location.country.name, location.state.name, location.city.name, location.category.name],
          location.updatedAt,
        );
      }
    }
  }

  return {
    countries: finalizeGroups(countries),
    states: finalizeGroups(states),
    cities: finalizeGroups(cities),
    categories: finalizeGroups(categories),
    cityCategories: finalizeGroups(cityCategories),
    stateCategories: finalizeGroups(stateCategories),
  };
}
