/** Shared default SEO title/description text for a City + Category
 * locations page (/locations/[country]/[state]/[city]/[category]) — used by
 * both the public page's generateMetadata and the admin SEO override editor
 * (as placeholder text for the "use default" state), so the two can never
 * drift apart. */
export function buildCategoryCityDefaultTitle(categoryName: string, cityName: string) {
  return `${categoryName} Pre-Wedding Photoshoot Locations in ${cityName}`;
}

export function buildCategoryCityDefaultDescription(
  categoryName: string,
  cityName: string,
  stateName: string,
) {
  return `Browse ${categoryName.toLowerCase()} pre-wedding photoshoot locations in ${cityName}, ${stateName}.`;
}

/** Shared default SEO title/description text for a State + Category
 * locations page (/locations/[country]/[state]/[category]) — same reuse
 * purpose as the City + Category builders above (public generateMetadata
 * and the admin SEO override editor's placeholder text). */
export function buildStateCategoryDefaultTitle(categoryName: string, stateName: string) {
  return `${categoryName} Pre-Wedding Photoshoot Locations in ${stateName}`;
}

export function buildStateCategoryDefaultDescription(categoryName: string, stateName: string) {
  return `Browse ${categoryName.toLowerCase()} pre-wedding photoshoot locations across ${stateName}.`;
}

/** Distinct category names actually present on a set of published locations,
 * deduped by slug and sorted alphabetically. Used to build geo-page
 * descriptions that only claim categories the page's own data supports —
 * never a hardcoded list. */
export function extractCategoryNames(
  locations: { category: { name: string; slug: string } | null }[],
): string[] {
  const map = new Map<string, string>();
  for (const location of locations) {
    if (location.category) map.set(location.category.slug, location.category.name);
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b));
}

/** Shared default SEO description for a City or State locations page (no
 * category filter) — derives the category list from the place's own
 * published locations instead of a fixed set, so it never claims a category
 * (e.g. "temples") that isn't actually represented on the page. */
export function buildGeoDefaultDescription(placeName: string, parentName: string | null, categoryNames: string[]) {
  const location = parentName ? `${placeName}, ${parentName}` : placeName;
  if (categoryNames.length === 0) {
    return `Explore pre-wedding photoshoot locations in ${location}.`;
  }
  const list = categoryNames.map((name) => name.toLowerCase()).join(", ");
  return `Explore pre-wedding photoshoot locations in ${location}, including ${list}.`;
}
