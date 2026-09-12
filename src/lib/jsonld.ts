import type { ExtraDetails, PublicLocationDetail, PublicStudioDetail, PublicBlogPostDetail } from "./public-data";
import type { BlogBlock } from "./blog/content-blocks";
import { getValidatedYouTubeVideo, type ValidatedYouTubeVideo } from "./youtube";
import { SITE_URL } from "./site-url";

export function absoluteUrl(path: string) {
  return `${SITE_URL}${path}`;
}

/** Branded default social-share image for pages without their own
 * location/studio photo. Next.js replaces a segment's whole `openGraph`
 * object rather than deep-merging `images` from an ancestor layout, so
 * every page's own `openGraph.images` needs this explicitly. */
export const DEFAULT_OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "PhotoBlinks — Photoshoot Locations",
};

/** WebSite schema for the homepage/root experience. No potentialAction
 * (SearchAction) — the site has filters, not a dedicated search endpoint. */
export function buildWebSiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "PhotoBlinks",
    url: absoluteUrl("/"),
  };
}

/** Organization schema for the homepage/root experience. Only fields that
 * are actually true of the project today — no invented sameAs, contact
 * info, or logo asset. */
export function buildOrganizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "PhotoBlinks",
    url: absoluteUrl("/"),
    description: "Discover pre-wedding photoshoot locations across India.",
  };
}

export function buildBreadcrumbList(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

/** Plain-text (no UI emoji) label for the drone_status enum, for use in
 * structured data — see the emoji-prefixed DRONE_LABELS in
 * extra-details-list.tsx for the visual equivalent. */
export const DRONE_STATUS_SCHEMA_LABELS: Record<NonNullable<ExtraDetails["drone_status"]>, string> = {
  allowed: "Allowed",
  allowed_with_permission: "Allowed with Permission",
  restricted: "Restricted",
  prohibited: "Prohibited",
};

const PRE_WEDDING_SHOOT_SCHEMA_LABELS: Record<NonNullable<ExtraDetails["pre_wedding_shoot"]>, string> = {
  allowed: "Allowed",
  conditional: "Conditional",
  prohibited: "Prohibited",
};

const AVAILABILITY_BOOLEAN: Record<NonNullable<ExtraDetails["changing_rooms"]>, boolean> = {
  available: true,
  not_available: false,
};

type LocationFeature = {
  "@type": "LocationFeatureSpecification";
  name: string;
  value: string | boolean;
};

/** Maps the location/studio "extra detail" fields (Shoot Details, Pricing &
 * Timing, Amenities, Environment — the same fields rendered by
 * ExtraDetailsList) into LocationFeatureSpecification entries. Only fields
 * that are actually set are included — unknown/unset is omitted, never
 * output as false. */
function buildAmenityFeatures(details: ExtraDetails): LocationFeature[] {
  const features: LocationFeature[] = [];
  const add = (name: string, value: string | boolean | null) => {
    if (value !== null && value !== "") features.push({ "@type": "LocationFeatureSpecification", name, value });
  };

  add(
    "Pre-Wedding Shoot",
    details.pre_wedding_shoot ? PRE_WEDDING_SHOOT_SCHEMA_LABELS[details.pre_wedding_shoot] : null,
  );
  add("Pre-Wedding Shoot Condition", details.pre_wedding_shoot_condition);
  add("Prior Booking", details.prior_booking);
  add("Drone Status", details.drone_status ? DRONE_STATUS_SCHEMA_LABELS[details.drone_status] : null);
  add("Drone Permission", details.drone_permission);
  add("Recommended Outfits", details.recommended_outfits);
  add("Entry Fee", details.entry_fee);
  add("Shoot/Permit Info", details.shoot_permit_fee);
  add("Vehicle Parking", details.vehicle_parking_fee);
  add("Best Season", details.best_season);
  add("Best Time of Day", details.best_time);
  add("Road Accessibility", details.road_accessibility);
  add("Vehicle Parking Availability", details.parking_facility ? AVAILABILITY_BOOLEAN[details.parking_facility] : null);
  add("Boating Available for Shoot", details.boating_available);
  add("Changing Facilities", details.changing_rooms ? AVAILABILITY_BOOLEAN[details.changing_rooms] : null);
  add("Restrooms", details.restrooms);
  add("Facilities", details.facilities);
  add("Access Level", details.access);
  add("Crowd Level", details.crowd);
  add("Privacy Score", details.privacy);
  add("Weather & Lighting Considerations", details.weather_lighting);

  return features;
}

const MAX_VIDEO_DESCRIPTION_LENGTH = 200;

/** Trims a genuine description down to a schema-friendly length instead of
 * copying the whole page description into structured data. Cuts on a word
 * boundary; never invents content. */
function toVideoDescription(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_VIDEO_DESCRIPTION_LENGTH) return trimmed;
  const cut = trimmed.slice(0, MAX_VIDEO_DESCRIPTION_LENGTH);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : MAX_VIDEO_DESCRIPTION_LENGTH)}…`;
}

/** VideoObject for a validated YouTube video. `embedUrl`/`thumbnailUrl` are
 * derived from the exact same parsed video id that drives the on-page
 * iframe (see getValidatedYouTubeVideo) — schema and player can never
 * reference different videos. `uploadDate`/`duration` are intentionally
 * omitted: PhotoBlinks doesn't know either for a stored youtube_url, and
 * fabricating them would violate structured-data guidelines. */
function buildVideoObject(video: ValidatedYouTubeVideo, canonicalUrl: string, name: string, description: string) {
  return {
    "@type": "VideoObject",
    "@id": `${canonicalUrl}#video`,
    name,
    description,
    thumbnailUrl: [video.thumbnailUrl],
    embedUrl: video.embedUrl,
  };
}

/** Shared by locations and studios — both embed the same city/state/country
 * relations. Omitted entirely (not an empty object) when none are set. */
function buildAddress(place: {
  city: { name: string } | null;
  state: { name: string } | null;
  country: { name: string } | null;
}) {
  if (!place.city && !place.state && !place.country) return undefined;
  return {
    "@type": "PostalAddress",
    addressLocality: place.city?.name,
    addressRegion: place.state?.name,
    addressCountry: place.country?.name,
  };
}

/** Combined Place/TouristAttraction + BreadcrumbList structured data for a
 * location detail page, as a single JSON-LD script with an @graph — see
 * LocationJsonLd. Only includes fields that actually exist in the
 * database — no invented reviews/prices/permissions. `location`,
 * `breadcrumbItems`, and `ratingSummary` must be data the page already
 * loaded/computed; this never queries Supabase itself. `aggregateRating`
 * is only ever built from real, admin-approved comment ratings (Phase
 * 19C) — omitted entirely when there are none, never a fabricated score. */
export function buildLocationJsonLd(
  location: PublicLocationDetail,
  breadcrumbItems: { name: string; path: string }[],
  ratingSummary?: { average: number; count: number },
) {
  const canonicalUrl = absoluteUrl(`/location/${location.slug}`);
  const amenityFeature = buildAmenityFeatures(location);
  const breadcrumbList = buildBreadcrumbList(breadcrumbItems);
  // Same validated video (or null) that gates the on-page heading/iframe —
  // an unparseable/missing youtube_url never produces a VideoObject, and
  // never a `video` reference on the Place either.
  const video = getValidatedYouTubeVideo(location.youtube_url);

  const place = {
    "@type": ["Place", "TouristAttraction"],
    "@id": `${canonicalUrl}#place`,
    name: location.name,
    url: canonicalUrl,
    description: location.description ?? undefined,
    image: location.images.length > 0 ? location.images : undefined,
    address: buildAddress(location),
    geo:
      location.latitude != null && location.longitude != null
        ? {
            "@type": "GeoCoordinates",
            latitude: location.latitude,
            longitude: location.longitude,
          }
        : undefined,
    // TouristAttraction.isAccessibleForFree maps losslessly from
    // pricing_type for "free"/"paid"; "unknown" is omitted rather than
    // guessed as false.
    isAccessibleForFree:
      location.pricing_type === "free" ? true : location.pricing_type === "paid" ? false : undefined,
    amenityFeature: amenityFeature.length > 0 ? amenityFeature : undefined,
    aggregateRating:
      ratingSummary && ratingSummary.count > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: ratingSummary.average,
            reviewCount: ratingSummary.count,
            bestRating: 5,
            worstRating: 1,
          }
        : undefined,
    video: video ? { "@id": `${canonicalUrl}#video` } : undefined,
  };

  const graph: object[] = [
    place,
    {
      "@type": "BreadcrumbList",
      "@id": `${canonicalUrl}#breadcrumb`,
      itemListElement: breadcrumbList.itemListElement,
    },
  ];

  if (video) {
    const description = location.description
      ? toVideoDescription(location.description)
      : `Video of ${location.name}${location.city ? ` in ${location.city.name}` : ""}, a photoshoot location listed on PhotoBlinks.`;
    graph.push(buildVideoObject(video, canonicalUrl, `${location.name} Tour & Photoshoot Video`, description));
  }

  // Only ever built from FAQs actually rendered on the page — never
  // fabricated, never present when the location has none.
  if (location.faqs.length > 0) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${canonicalUrl}#faq`,
      mainEntity: location.faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      })),
    });
  }

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}

/** Combined LocalBusiness + BreadcrumbList (+ FAQPage when the studio has
 * FAQs) structured data for a studio detail page, as a single JSON-LD
 * script with an @graph — see StudioJsonLd. Mirrors buildLocationJsonLd.
 * Only includes fields that actually exist in the database — no invented
 * ratings/reviews/prices. `studio` and `breadcrumbItems` must be data the
 * page already loaded/computed; this never queries Supabase itself. */
export function buildStudioJsonLd(
  studio: PublicStudioDetail,
  breadcrumbItems: { name: string; path: string }[],
) {
  const canonicalUrl = absoluteUrl(`/studio/${studio.slug}`);
  const breadcrumbList = buildBreadcrumbList(breadcrumbItems);
  // Same validated video (or null) that gates the on-page heading/iframe —
  // an unparseable/missing youtube_url never produces a VideoObject, and
  // never a `video` reference on the LocalBusiness either.
  const video = getValidatedYouTubeVideo(studio.youtube_url);

  const business = {
    "@type": "LocalBusiness",
    "@id": `${canonicalUrl}#business`,
    name: studio.name,
    url: canonicalUrl,
    description: studio.description ?? undefined,
    image: studio.images.length > 0 ? studio.images : undefined,
    address: buildAddress(studio),
    geo:
      studio.latitude != null && studio.longitude != null
        ? {
            "@type": "GeoCoordinates",
            latitude: studio.latitude,
            longitude: studio.longitude,
          }
        : undefined,
    video: video ? { "@id": `${canonicalUrl}#video` } : undefined,
  };

  const graph: object[] = [
    business,
    {
      "@type": "BreadcrumbList",
      "@id": `${canonicalUrl}#breadcrumb`,
      itemListElement: breadcrumbList.itemListElement,
    },
  ];

  if (video) {
    const description = studio.description
      ? toVideoDescription(studio.description)
      : `${studio.name}, a photography studio${studio.city ? ` in ${studio.city.name}` : ""}.`;
    graph.push(buildVideoObject(video, canonicalUrl, `${studio.name} Video`, description));
  }

  // Only ever built from FAQs actually rendered on the page — never
  // fabricated, never present when the studio has none.
  if (studio.faqs.length > 0) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${canonicalUrl}#faq`,
      mainEntity: studio.faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      })),
    });
  }

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}

/** Combined BlogPosting + BreadcrumbList (+ FAQPage when the post has FAQs)
 * structured data for a published blog article, as one JSON-LD script with
 * an @graph — mirrors buildLocationJsonLd/buildStudioJsonLd. `post` and
 * `breadcrumbItems` must be data the page already loaded via
 * getPublishedBlogPostBySlug; this never queries Supabase itself, and never
 * runs for a draft (the page 404s before this is ever called). */
export function buildBlogPostingJsonLd(
  post: PublicBlogPostDetail,
  breadcrumbItems: { name: string; path: string }[],
) {
  const canonicalUrl = absoluteUrl(`/blog/${post.slug}`);
  const breadcrumbList = buildBreadcrumbList(breadcrumbItems);

  const posting = {
    "@type": "BlogPosting",
    "@id": `${canonicalUrl}#article`,
    headline: post.title,
    description: post.excerpt ?? undefined,
    image: post.featuredImageUrl ? [post.featuredImageUrl] : undefined,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    author: { "@type": "Person", name: post.authorName },
    publisher: { "@type": "Organization", name: "PhotoBlinks", url: absoluteUrl("/") },
    mainEntityOfPage: canonicalUrl,
    url: canonicalUrl,
  };

  const graph: object[] = [
    posting,
    {
      "@type": "BreadcrumbList",
      "@id": `${canonicalUrl}#breadcrumb`,
      itemListElement: breadcrumbList.itemListElement,
    },
  ];

  // Single consistent FAQPage source: merge the post's inline faq content
  // blocks (already validated by getPublishedBlogPostBySlug, in document
  // order) with its blog_faqs rows (already ordered by sort_order there).
  // Exact-question duplicates are dropped with the first occurrence winning,
  // keeping the output deterministic regardless of which source a question
  // came from. Only ever built from FAQs actually rendered on the page —
  // never fabricated, never present when the post has none.
  const faqBlocks = post.content
    .filter((block): block is Extract<BlogBlock, { type: "faq" }> => block.type === "faq")
    .map((block) => ({ question: block.question, answer: block.answer }));

  const mergedFaqs: { question: string; answer: string }[] = [];
  const seenQuestions = new Set<string>();
  for (const faq of [...faqBlocks, ...post.faqs]) {
    if (seenQuestions.has(faq.question)) continue;
    seenQuestions.add(faq.question);
    mergedFaqs.push(faq);
  }

  if (mergedFaqs.length > 0) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${canonicalUrl}#faq`,
      mainEntity: mergedFaqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      })),
    });
  }

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}

export function buildItemListJsonLd(name: string, items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: absoluteUrl(item.path),
    })),
  };
}
