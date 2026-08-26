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

  // Location SEO tree: country, country/state, country/state/city,
  // country/state/city/category — only combinations that actually have
  // published content.
  const countryGroups = new Map<string, { path: string; dates: string[] }>();
  const stateGroups = new Map<string, { path: string; dates: string[] }>();
  const cityGroups = new Map<string, { path: string; dates: string[] }>();
  const categoryGroups = new Map<string, { path: string; dates: string[] }>();

  for (const location of locations) {
    if (!location.country || !location.state) continue;
    const countryKey = location.country.slug;
    if (!countryGroups.has(countryKey)) {
      countryGroups.set(countryKey, { path: countryKey, dates: [] });
    }
    countryGroups.get(countryKey)!.dates.push(location.updatedAt);

    const stateKey = `${countryKey}/${location.state.slug}`;
    if (!stateGroups.has(stateKey)) stateGroups.set(stateKey, { path: stateKey, dates: [] });
    stateGroups.get(stateKey)!.dates.push(location.updatedAt);

    if (location.city) {
      const cityKey = `${stateKey}/${location.city.slug}`;
      if (!cityGroups.has(cityKey)) cityGroups.set(cityKey, { path: cityKey, dates: [] });
      cityGroups.get(cityKey)!.dates.push(location.updatedAt);

      if (location.category) {
        const categoryKey = `${cityKey}/${location.category.slug}`;
        if (!categoryGroups.has(categoryKey)) {
          categoryGroups.set(categoryKey, { path: categoryKey, dates: [] });
        }
        categoryGroups.get(categoryKey)!.dates.push(location.updatedAt);
      }
    }
  }

  for (const group of countryGroups.values()) {
    entries.push({
      url: `${SITE_URL}/locations/${group.path}`,
      lastModified: latest(group.dates),
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }
  for (const group of stateGroups.values()) {
    entries.push({
      url: `${SITE_URL}/locations/${group.path}`,
      lastModified: latest(group.dates),
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }
  for (const group of cityGroups.values()) {
    entries.push({
      url: `${SITE_URL}/locations/${group.path}`,
      lastModified: latest(group.dates),
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }
  for (const group of categoryGroups.values()) {
    entries.push({
      url: `${SITE_URL}/locations/${group.path}`,
      lastModified: latest(group.dates),
      changeFrequency: "weekly",
      priority: 0.5,
    });
  }

  // Studios SEO tree: country, country/state, country/state/city (no
  // category level for studios).
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
