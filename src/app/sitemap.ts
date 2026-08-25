import type { MetadataRoute } from "next";
import { getPublishedLocations, getPublishedStudios } from "@/lib/public-data";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

function latest(dates: string[]) {
  return dates.reduce((max, d) => (d > max ? d : max), dates[0]);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [locations, studios] = await Promise.all([getPublishedLocations(), getPublishedStudios()]);

  const entries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/locations`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/studios`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/locations/map`, changeFrequency: "daily", priority: 0.7 },
  ];

  // Location detail pages
  for (const location of locations) {
    entries.push({
      url: `${SITE_URL}/location/${location.slug}`,
      lastModified: location.updatedAt,
      changeFrequency: "weekly",
      priority: 0.7,
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

  // Location SEO tree: state, state/city, state/city/category — only
  // combinations that actually have published content.
  const stateGroups = new Map<string, { slug: string; dates: string[] }>();
  const cityGroups = new Map<string, { statePath: string; citySlug: string; dates: string[] }>();
  const categoryGroups = new Map<
    string,
    { statePath: string; citySlug: string; categorySlug: string; dates: string[] }
  >();

  for (const location of locations) {
    if (!location.state) continue;
    const stateKey = location.state.slug;
    if (!stateGroups.has(stateKey)) stateGroups.set(stateKey, { slug: stateKey, dates: [] });
    stateGroups.get(stateKey)!.dates.push(location.updatedAt);

    if (location.city) {
      const cityKey = `${stateKey}/${location.city.slug}`;
      if (!cityGroups.has(cityKey)) {
        cityGroups.set(cityKey, { statePath: stateKey, citySlug: location.city.slug, dates: [] });
      }
      cityGroups.get(cityKey)!.dates.push(location.updatedAt);

      if (location.category) {
        const categoryKey = `${stateKey}/${location.city.slug}/${location.category.slug}`;
        if (!categoryGroups.has(categoryKey)) {
          categoryGroups.set(categoryKey, {
            statePath: stateKey,
            citySlug: location.city.slug,
            categorySlug: location.category.slug,
            dates: [],
          });
        }
        categoryGroups.get(categoryKey)!.dates.push(location.updatedAt);
      }
    }
  }

  for (const group of stateGroups.values()) {
    entries.push({
      url: `${SITE_URL}/locations/${group.slug}`,
      lastModified: latest(group.dates),
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }
  for (const group of cityGroups.values()) {
    entries.push({
      url: `${SITE_URL}/locations/${group.statePath}/${group.citySlug}`,
      lastModified: latest(group.dates),
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }
  for (const group of categoryGroups.values()) {
    entries.push({
      url: `${SITE_URL}/locations/${group.statePath}/${group.citySlug}/${group.categorySlug}`,
      lastModified: latest(group.dates),
      changeFrequency: "weekly",
      priority: 0.5,
    });
  }

  // Studios SEO tree: state, state/city (no category level for studios).
  const studioStateGroups = new Map<string, { slug: string; dates: string[] }>();
  const studioCityGroups = new Map<string, { statePath: string; citySlug: string; dates: string[] }>();

  for (const studio of studios) {
    if (!studio.state) continue;
    const stateKey = studio.state.slug;
    if (!studioStateGroups.has(stateKey)) studioStateGroups.set(stateKey, { slug: stateKey, dates: [] });
    studioStateGroups.get(stateKey)!.dates.push(studio.updatedAt);

    if (studio.city) {
      const cityKey = `${stateKey}/${studio.city.slug}`;
      if (!studioCityGroups.has(cityKey)) {
        studioCityGroups.set(cityKey, { statePath: stateKey, citySlug: studio.city.slug, dates: [] });
      }
      studioCityGroups.get(cityKey)!.dates.push(studio.updatedAt);
    }
  }

  for (const group of studioStateGroups.values()) {
    entries.push({
      url: `${SITE_URL}/studios/${group.slug}`,
      lastModified: latest(group.dates),
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }
  for (const group of studioCityGroups.values()) {
    entries.push({
      url: `${SITE_URL}/studios/${group.statePath}/${group.citySlug}`,
      lastModified: latest(group.dates),
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }

  return entries;
}
