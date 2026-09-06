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
