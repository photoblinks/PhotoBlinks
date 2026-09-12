import {
  getActiveCategories,
  getPublishedLocationCount,
  getPublishedLocations,
  getPublishedBlogPostsForSitemap,
} from "@/lib/public-data";
import { absoluteUrl } from "@/lib/jsonld";
import { buildLocationGeoGroups, type SeoGeoGroup } from "@/lib/seo-eligibility";

// Same cache window as the public-data.ts queries this is built from, so a
// publish/unpublish becomes visible here within the same window as
// everywhere else on the public site — no separate cache invalidation to
// maintain, and no manually-edited static file to go stale. Must be a
// literal here — Next statically analyzes this segment config export at
// build time, so it can't be an imported reference (kept in sync by hand
// with public-data.ts's PUBLIC_REVALIDATE_SECONDS).
export const revalidate = 60;

function listEligible(groups: SeoGeoGroup[], basePath: string) {
  return groups
    .filter((g) => g.eligible)
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((g) => `- ${g.names[g.names.length - 1]}: ${absoluteUrl(`${basePath}/${g.path}`)} (${g.count} locations)`)
    .join("\n");
}

export async function GET() {
  const [locationCount, locations, categories, blogPosts] = await Promise.all([
    getPublishedLocationCount(),
    getPublishedLocations(),
    getActiveCategories(),
    getPublishedBlogPostsForSitemap(),
  ]);

  const geo = buildLocationGeoGroups(locations);
  const eligibleCategories = geo.categories.filter((g) =>
    categories.some((c) => c.slug === g.path),
  );

  const sections = [
    `# PhotoBlinks

PhotoBlinks is a discovery platform for pre-wedding photoshoot locations and studios across India (launching in Karnataka and Kerala, expanding nationwide). Every listing is a publicly verified, individually published page — beaches, temples, waterfalls, hills and more — with practical shoot details such as pricing, drone policy, best time to visit, and accessibility. Locations and studios are separate concepts: locations are natural/outdoor shoot spots organized by category, studios are preset indoor venues.`,

    `## Pre-Wedding Shoot Locations

- Browse all locations: ${absoluteUrl("/locations")}
- Browse all studios: ${absoluteUrl("/studios")}
- Interactive map: ${absoluteUrl("/locations/map")}
- ${locationCount} individually published locations. Every published location has its own indexable page at /location/{slug} — this is never restricted by aggregation-page thresholds below. See /llms-full.txt for the complete list with details.`,

    `## Geographic Discovery

The pages below aggregate multiple locations by country, state, city, or category. To avoid promoting thin directory pages, an aggregation page is only listed here once it has at least 5 published locations — the same threshold used for this site's own search-engine indexing. This threshold applies ONLY to these aggregation pages; it never hides or restricts an individual location's own page.

### Countries
${listEligible(geo.countries, "/locations") || "(none yet)"}

### States
${listEligible(geo.states, "/locations") || "(none yet)"}

### Cities
${listEligible(geo.cities, "/locations") || "(none yet)"}

### Categories
${
  eligibleCategories.length > 0
    ? eligibleCategories
        .sort((a, b) => a.path.localeCompare(b.path))
        .map((g) => `- ${g.names[0]}: ${absoluteUrl(`/category/${g.path}`)} (${g.count} locations)`)
        .join("\n")
    : "(none yet)"
}

### City + Category
${listEligible(geo.cityCategories, "/locations") || "(none yet)"}

### State + Category
${listEligible(geo.stateCategories, "/locations") || "(none yet)"}`,

    `## Photographers

Verified photographer contact details appear directly on eligible location pages, either as approved photographer-submitted photos or as a clearly labeled sponsored placement. PhotoBlinks does not operate standalone public photographer profile pages.`,

    `## Guides / Blog

- All articles: ${absoluteUrl("/blog")}
- ${blogPosts.length} published articles. See /llms-full.txt for titles, summaries, and dates.`,

    `## Machine-Readable Data

- Full curated public dataset: ${absoluteUrl("/llms-full.txt")}
- XML sitemap: ${absoluteUrl("/sitemap.xml")}`,
  ];

  return new Response(sections.join("\n\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
