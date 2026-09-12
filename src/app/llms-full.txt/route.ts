import {
  getPublishedLocations,
  getPublishedStudios,
  getPublishedBlogPostsForLlms,
  getActiveSponsoredPhotographers,
  PUBLIC_REVALIDATE_SECONDS,
  type PublicLocationCard,
  type PublicStudioCard,
} from "@/lib/public-data";
import { absoluteUrl, DRONE_STATUS_SCHEMA_LABELS } from "@/lib/jsonld";
import { buildLocationGeoGroups, type SeoGeoGroup } from "@/lib/seo-eligibility";

// Same cache window as the underlying public-data.ts queries — a
// publish/unpublish (location, studio, article) or a geo/category
// combination crossing the 5-location threshold is reflected here within
// this window, with no manual regeneration step. Must be a literal here —
// Next statically analyzes this segment config export at build time, so it
// can't be an imported reference (kept in sync by hand with
// public-data.ts's PUBLIC_REVALIDATE_SECONDS, also used below for display).
export const revalidate = 60;

function pricingLine(location: PublicLocationCard) {
  if (location.pricing_type === "free") return "Free";
  if (location.pricing_type === "paid") return location.price != null ? `Paid (₹${location.price})` : "Paid";
  return "Unknown";
}

function locationEntry(location: PublicLocationCard) {
  const url = absoluteUrl(`/location/${location.slug}`);
  const lines = [
    `### ${location.cardName || location.name}`,
    `- URL: [${url}](${url})`,
    `- Category: ${location.category?.name ?? "Uncategorized"}`,
    `- Location: ${[location.city?.name, location.state?.name, location.country?.name]
      .filter(Boolean)
      .join(", ")}`,
    `- Pricing: ${pricingLine(location)}`,
  ];
  if (location.droneStatus) {
    lines.push(`- Drone policy: ${DRONE_STATUS_SCHEMA_LABELS[location.droneStatus]}`);
  }
  lines.push(`- Last updated: ${location.updatedAt}`);
  return lines.join("\n");
}

function studioEntry(studio: PublicStudioCard) {
  const url = absoluteUrl(`/studio/${studio.slug}`);
  const lines = [
    `### ${studio.cardName || studio.name}`,
    `- URL: [${url}](${url})`,
    `- Location: ${[studio.city?.name, studio.state?.name, studio.country?.name].filter(Boolean).join(", ")}`,
  ];
  if (studio.fromPrice != null) lines.push(`- Starting price: ₹${studio.fromPrice}`);
  lines.push(`- Last updated: ${studio.updatedAt}`);
  return lines.join("\n");
}

function aggregationEntry(group: SeoGeoGroup, basePath: string) {
  const url = absoluteUrl(`${basePath}/${group.path}`);
  return `### ${group.names.join(", ")}\n- URL: [${url}](${url})\n- Published locations: ${group.count}\n- Last updated: ${group.lastModified}`;
}

export async function GET() {
  const [locations, studios, blogPosts, photographers] = await Promise.all([
    getPublishedLocations(),
    getPublishedStudios(),
    getPublishedBlogPostsForLlms(),
    getActiveSponsoredPhotographers(),
  ]);

  const geo = buildLocationGeoGroups(locations);
  const eligible = (groups: SeoGeoGroup[]) =>
    groups.filter((g) => g.eligible).sort((a, b) => a.path.localeCompare(b.path));

  const sections: string[] = [];

  sections.push(
    `# PhotoBlinks — Full Public Dataset

> Curated, machine-readable dataset of every published PhotoBlinks location, studio, and article — no admin, moderation, or private-user data.

Curated, machine-readable representation of PhotoBlinks' public content. Only published/approved data intentionally shown on the public site is included — no admin, moderation, submission, or private-user data. Regenerated automatically (cache window: ${PUBLIC_REVALIDATE_SECONDS}s) as content is published or unpublished; no manual maintenance.

The 5-published-location threshold below applies ONLY to geographic/category AGGREGATION pages (country, state, city, category, city+category, state+category). Individual location pages are listed and indexable regardless of that threshold — a single published location always gets its own entry.`,
  );

  sections.push(
    `## Individual Locations (${locations.length})\n\n${locations.map(locationEntry).join("\n\n")}`,
  );

  sections.push(`## Studios (${studios.length})\n\n${studios.map(studioEntry).join("\n\n")}`);

  const geoSections: string[] = [];
  const eligibleCountries = eligible(geo.countries);
  if (eligibleCountries.length > 0) {
    geoSections.push(
      `### Countries\n\n${eligibleCountries.map((g) => aggregationEntry(g, "/locations")).join("\n\n")}`,
    );
  }
  const eligibleStates = eligible(geo.states);
  if (eligibleStates.length > 0) {
    geoSections.push(
      `### States\n\n${eligibleStates.map((g) => aggregationEntry(g, "/locations")).join("\n\n")}`,
    );
  }
  const eligibleCities = eligible(geo.cities);
  if (eligibleCities.length > 0) {
    geoSections.push(
      `### Cities\n\n${eligibleCities.map((g) => aggregationEntry(g, "/locations")).join("\n\n")}`,
    );
  }
  const eligibleCategories = eligible(geo.categories);
  if (eligibleCategories.length > 0) {
    geoSections.push(
      `### Categories\n\n${eligibleCategories.map((g) => aggregationEntry(g, "/category")).join("\n\n")}`,
    );
  }
  const eligibleCityCategories = eligible(geo.cityCategories);
  if (eligibleCityCategories.length > 0) {
    geoSections.push(
      `### City + Category\n\n${eligibleCityCategories.map((g) => aggregationEntry(g, "/locations")).join("\n\n")}`,
    );
  }
  const eligibleStateCategories = eligible(geo.stateCategories);
  if (eligibleStateCategories.length > 0) {
    geoSections.push(
      `### State + Category\n\n${eligibleStateCategories.map((g) => aggregationEntry(g, "/locations")).join("\n\n")}`,
    );
  }

  sections.push(
    `## Geographic & Category Aggregation Pages\n\nOnly aggregation pages with at least 5 published locations are listed here — see /llms.txt for the rule. This never affects the individual location listing above.\n\n${
      geoSections.length > 0 ? geoSections.join("\n\n") : "(none currently eligible)"
    }`,
  );

  sections.push(
    `## Guides / Blog (${blogPosts.length})\n\n${blogPosts
      .map((post) => {
        const url = absoluteUrl(`/blog/${post.slug}`);
        return `### ${post.title}\n- URL: [${url}](${url})\n- Summary: ${
          post.excerpt ?? "(no summary)"
        }\n- Category: ${post.category?.name ?? "Uncategorized"}\n- Published: ${
          post.publishedAt
        }\n- Updated: ${post.updatedAt}`;
      })
      .join("\n\n")}`,
  );

  if (photographers.length > 0) {
    sections.push(
      `## Photographers (${photographers.length})\n\nSponsored placements shown on eligible location pages within the listed state — labeled "Sponsored" on-site, never an editorial recommendation or venue verification.\n\n${photographers
        .map(
          (p) =>
            `### ${p.photography_name}\n- State: ${p.state?.name ?? "Unspecified"}\n- ${p.title}${
              p.description ? `\n- ${p.description}` : ""
            }\n- Contact: ${p.phone_number}`,
        )
        .join("\n\n")}`,
    );
  }

  return new Response(sections.join("\n\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
