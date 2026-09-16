import type { MetadataRoute } from "next";
import {
  getActiveBlogCategories,
  getActiveCategories,
  getPublishedLocations,
  getPublishedStudios,
  getPublishedBlogPostsForSitemap,
} from "@/lib/public-data";
import { buildLocationGeoGroups } from "@/lib/seo-eligibility";
import { SITE_URL } from "@/lib/site-url";

// The audit-flagged fix: without this, sitemap.ts is generated once at
// build time and never refreshed, so publishing/unpublishing a location
// (or a geo/category combination crossing the 5-location threshold) has no
// effect on the sitemap until the next deploy. Must be a literal here —
// Next statically analyzes this segment config export at build time, so it
// can't be an imported reference. Kept in sync with public-data.ts's
// PUBLIC_REVALIDATE_SECONDS by hand (same 60s window everything else uses).
export const revalidate = 60;

function latest(dates: string[]) {
  return dates.reduce((max, d) => (d > max ? d : max), dates[0]);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [locations, studios, categories, blogPosts, blogCategories] = await Promise.all([
    getPublishedLocations(),
    getPublishedStudios(),
    getActiveCategories(),
    getPublishedBlogPostsForSitemap(),
    getActiveBlogCategories(),
  ]);

  const entries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/locations`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/studios`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/blog`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_URL}/locations/map`, changeFrequency: "daily", priority: 0.7 },
    // Static trust/transparency pages — not location/category SEO landing
    // pages, so they're unconditional and don't use isSeoEligible.
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/how-it-works`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/data-and-verification`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/report-an-issue`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/contact`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];

  // Individual location detail pages — NEVER gated by the 5-location
  // aggregation threshold. A published location is always sitemap-eligible
  // regardless of how many sibling locations exist in its city/state/
  // country/category (see seo-eligibility.ts's module docstring).
  for (const location of locations) {
    entries.push({
      url: `${SITE_URL}/location/${location.slug}`,
      lastModified: location.updatedAt,
      changeFrequency: "weekly",
      priority: 0.7,
    });
  }

  // Dedicated per-category blog landing pages (/blog/category/[slug]) — the
  // F7 clean-URL replacement for the old ?category= query variant, which
  // was never sitemap-eligible.
  for (const category of blogCategories) {
    entries.push({
      url: `${SITE_URL}/blog/category/${category.slug}`,
      changeFrequency: "weekly",
      priority: 0.5,
    });
  }

  // Blog post detail pages — published only (getPublishedBlogPostsForSitemap
  // never returns a draft).
  for (const post of blogPosts) {
    entries.push({
      url: `${SITE_URL}/blog/${post.slug}`,
      lastModified: post.updatedAt,
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }

  // Studio detail pages
  for (const studio of studios) {
    entries.push({
      url: `${SITE_URL}/studio/${studio.slug}`,
      lastModified: studio.updatedAt,
      changeFrequency: "weekly",
      priority: 0.7,
    });
  }

  // Location SEO tree: category, country, country/state, country/state/city,
  // country/state/city/category, country/state/category — every
  // aggregation/landing page below is gated on the same 5-published-location
  // threshold (SEO_ELIGIBLE_LOCATION_THRESHOLD), computed once by
  // buildLocationGeoGroups so this file, the geo pages' own noindex logic,
  // and /llms.txt + /llms-full.txt never disagree.
  const geoGroups = buildLocationGeoGroups(locations);

  // Dedicated per-category landing pages (/category/[slug]).
  for (const category of categories) {
    const group = geoGroups.categories.find((g) => g.path === category.slug);
    if (!group?.eligible) continue;
    entries.push({
      url: `${SITE_URL}/category/${category.slug}`,
      lastModified: group.lastModified,
      changeFrequency: "weekly",
      priority: 0.7,
    });
  }

  for (const group of geoGroups.countries) {
    if (!group.eligible) continue;
    entries.push({
      url: `${SITE_URL}/locations/${group.path}`,
      lastModified: group.lastModified,
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }
  for (const group of geoGroups.states) {
    if (!group.eligible) continue;
    entries.push({
      url: `${SITE_URL}/locations/${group.path}`,
      lastModified: group.lastModified,
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }
  for (const group of geoGroups.cities) {
    if (!group.eligible) continue;
    entries.push({
      url: `${SITE_URL}/locations/${group.path}`,
      lastModified: group.lastModified,
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }
  for (const group of geoGroups.stateCategories) {
    if (!group.eligible) continue;
    entries.push({
      url: `${SITE_URL}/locations/${group.path}`,
      lastModified: group.lastModified,
      changeFrequency: "weekly",
      priority: 0.55,
    });
  }
  for (const group of geoGroups.cityCategories) {
    if (!group.eligible) continue;
    entries.push({
      url: `${SITE_URL}/locations/${group.path}`,
      lastModified: group.lastModified,
      changeFrequency: "weekly",
      priority: 0.5,
    });
  }

  // Studios SEO tree: country, country/state, country/state/city (no
  // category level for studios). Studio aggregation pages have no
  // published-count threshold today (no city+category/state+category
  // equivalent exists for studios) — unchanged from prior behavior.
  const studioCountryGroups = new Map<string, { path: string; dates: string[] }>();
  const studioStateGroups = new Map<string, { path: string; dates: string[] }>();
  const studioCityGroups = new Map<string, { path: string; dates: string[] }>();

  for (const studio of studios) {
    if (!studio.country || !studio.state) continue;
    const countryKey = studio.country.slug;
    if (!studioCountryGroups.has(countryKey)) {
      studioCountryGroups.set(countryKey, { path: countryKey, dates: [] });
    }
    studioCountryGroups.get(countryKey)!.dates.push(studio.updatedAt);

    const stateKey = `${countryKey}/${studio.state.slug}`;
    if (!studioStateGroups.has(stateKey)) studioStateGroups.set(stateKey, { path: stateKey, dates: [] });
    studioStateGroups.get(stateKey)!.dates.push(studio.updatedAt);

    if (studio.city) {
      const cityKey = `${stateKey}/${studio.city.slug}`;
      if (!studioCityGroups.has(cityKey)) studioCityGroups.set(cityKey, { path: cityKey, dates: [] });
      studioCityGroups.get(cityKey)!.dates.push(studio.updatedAt);
    }
  }

  for (const group of studioCountryGroups.values()) {
    entries.push({
      url: `${SITE_URL}/studios/${group.path}`,
      lastModified: latest(group.dates),
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }
  for (const group of studioStateGroups.values()) {
    entries.push({
      url: `${SITE_URL}/studios/${group.path}`,
      lastModified: latest(group.dates),
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }
  for (const group of studioCityGroups.values()) {
    entries.push({
      url: `${SITE_URL}/studios/${group.path}`,
      lastModified: latest(group.dates),
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }

  return entries;
}
