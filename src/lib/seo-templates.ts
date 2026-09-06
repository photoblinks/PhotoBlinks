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
