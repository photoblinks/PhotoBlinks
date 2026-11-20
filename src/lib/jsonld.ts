import type { ExtraDetails, PublicEditor, PublicLocationDetail, PublicStudioDetail, PublicBlogPostDetail } from "./public-data";
import type { BlogBlock } from "./blog/content-blocks";
import { getValidatedYouTubeVideo, type ValidatedYouTubeVideo } from "./youtube";
import { SITE_URL } from "./site-url";
import { toTransformUrl } from "./cf-image-loader";
import { ACCESS_OPTIONS, AVAILABILITY_OPTIONS, CROWD_OPTIONS, optionLabel } from "./detail-options";

export function absoluteUrl(path: string) {
  return `${SITE_URL}${path}`;
}

const SOCIAL_IMAGE_WIDTH = 1200;

/** Transform-endpoint URL for OG/Twitter/JSON-LD images, so public metadata
 * never exposes the raw R2 original. */
export function socialImageUrl(rawUrl: string) {
  return toTransformUrl(rawUrl, SOCIAL_IMAGE_WIDTH);
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

/** Keeps list-page ItemLists a sane size on big directories. */
const MAX_LIST_ITEMS = 100;
const SCHEMA_CONTEXT = "https://schema.org";
const WEBSITE_ID = absoluteUrl("/#website");
const ORGANIZATION_ID = absoluteUrl("/#organization");

type PathItem = { name: string; path: string };
type Faq = { question: string; answer: string };

/** Wraps nodes into the single `@graph` document every page emits. */
export function buildGraph(nodes: object[]) {
  return { "@context": SCHEMA_CONTEXT, "@graph": nodes };
}

/** Self-contained (name + url) so any page's graph can reference the
 * site/org identity without the homepage's full node being present. */
export const websiteRef = () => ({ "@type": "WebSite", "@id": WEBSITE_ID, name: "PhotoBlinks", url: absoluteUrl("/") });
const organizationRef = () => ({ "@type": "Organization", "@id": ORGANIZATION_ID, name: "PhotoBlinks", url: absoluteUrl("/") });

/** Homepage graph: WebSite + Organization, linked by `@id`. No
 * potentialAction (SearchAction) — the site has filters, not a dedicated
 * search endpoint. Only fields that are actually true of the project today —
 * no invented sameAs, contact info, or logo asset. */
export function buildHomeJsonLd() {
  return buildGraph([
    { ...websiteRef(), publisher: { "@id": ORGANIZATION_ID } },
    { ...organizationRef(), description: "Discover pre-wedding photoshoot locations across India." },
  ]);
}

export function buildBreadcrumbNode(canonicalUrl: string, items: PathItem[]) {
  return {
    "@type": "BreadcrumbList",
    "@id": `${canonicalUrl}#breadcrumb`,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

/** FAQPage graph node. Only ever built from FAQs actually rendered on the
 * page — callers pass nothing when there are none (returns null). */
export function buildFaqPage(faqs: Faq[], canonicalUrl?: string) {
  if (faqs.length === 0) return null;
  return {
    "@type": "FAQPage",
    ...(canonicalUrl ? { "@id": `${canonicalUrl}#faq` } : {}),
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}

function buildGeo(latitude: number | null, longitude: number | null) {
  return latitude != null && longitude != null ? { "@type": "GeoCoordinates", latitude, longitude } : undefined;
}

/** Detail-page graph: WebPage (links the page to the site, its breadcrumb and
 * its main entity) + main entity + BreadcrumbList + optional extras. */
function buildEntityGraph(opts: {
  canonicalUrl: string;
  name: string;
  description?: string | null;
  main: { "@id": string };
  breadcrumbItems: PathItem[];
  extras: (object | null)[];
}) {
  const { canonicalUrl, name, description, main, breadcrumbItems, extras } = opts;
  return buildGraph([
    {
      "@type": "WebPage",
      "@id": `${canonicalUrl}#webpage`,
      url: canonicalUrl,
      name,
      description: description ?? undefined,
      isPartOf: websiteRef(),
      breadcrumb: { "@id": `${canonicalUrl}#breadcrumb` },
      mainEntity: { "@id": main["@id"] },
    },
    main,
    buildBreadcrumbNode(canonicalUrl, breadcrumbItems),
    ...extras.filter((node): node is object => node !== null),
  ]);
}

/** One call for every non-detail public page: a WebPage-family node tied to
 * the site and its breadcrumb. Passing `items` makes it a list page — the
 * ItemList becomes the page's mainEntity (replaces hand-built ItemList
 * scripts). `type` defaults to CollectionPage when `items` is set. */
export function buildPageJsonLd(opts: {
  name: string;
  description?: string | null;
  path: string;
  breadcrumbItems: PathItem[];
  type?: "WebPage" | "CollectionPage" | "AboutPage" | "ContactPage";
  items?: PathItem[];
}) {
  const { name, description, path, breadcrumbItems, items } = opts;
  const type = opts.type ?? (items ? "CollectionPage" : "WebPage");
  const url = absoluteUrl(path);
  return buildGraph([
    {
      "@type": type,
      "@id": `${url}#webpage`,
      url,
      name,
      description: description ?? undefined,
      isPartOf: websiteRef(),
      breadcrumb: { "@id": `${url}#breadcrumb` },
      mainEntity: items && items.length > 0 ? buildItemList(name, items.slice(0, MAX_LIST_ITEMS)) : undefined,
    },
    buildBreadcrumbNode(url, breadcrumbItems),
  ]);
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

const AVAILABILITY_BOOLEAN: Record<NonNullable<ExtraDetails["changing_rooms"]>, boolean | string> = {
  available: true,
  limited: "Limited",
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
  add("Restrooms", optionLabel(AVAILABILITY_OPTIONS, details.restrooms));
  add("Facilities", details.facilities);
  add("Access Level", optionLabel(ACCESS_OPTIONS, details.access));
  add("Crowd Level", optionLabel(CROWD_OPTIONS, details.crowd));
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
  breadcrumbItems: PathItem[],
  ratingSummary?: { average: number; count: number },
) {
  const canonicalUrl = absoluteUrl(`/location/${location.slug}`);
  const amenityFeature = buildAmenityFeatures(location);
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
    image: location.images.length > 0 ? location.images.map(socialImageUrl) : undefined,
    address: buildAddress(location),
    geo: buildGeo(location.latitude, location.longitude),
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

  const videoDescription = location.description
    ? toVideoDescription(location.description)
    : `Video of ${location.name}${location.city ? ` in ${location.city.name}` : ""}, a photoshoot location listed on PhotoBlinks.`;

  return buildEntityGraph({
    canonicalUrl,
    name: location.name,
    description: location.description,
    main: place,
    breadcrumbItems,
    extras: [
      video ? buildVideoObject(video, canonicalUrl, `${location.name} Tour & Photoshoot Video`, videoDescription) : null,
      buildFaqPage(location.faqs, canonicalUrl),
    ],
  });
}

/** Combined LocalBusiness + BreadcrumbList (+ FAQPage when the studio has
 * FAQs) structured data for a studio detail page, as a single JSON-LD
 * script with an @graph — see StudioJsonLd. Mirrors buildLocationJsonLd.
 * Only includes fields that actually exist in the database — no invented
 * ratings/reviews/prices. `studio` and `breadcrumbItems` must be data the
 * page already loaded/computed; this never queries Supabase itself. */
export function buildStudioJsonLd(
  studio: PublicStudioDetail,
  breadcrumbItems: PathItem[],
) {
  const canonicalUrl = absoluteUrl(`/studio/${studio.slug}`);
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
    image: studio.images.length > 0 ? studio.images.map(socialImageUrl) : undefined,
    address: buildAddress(studio),
    geo: buildGeo(studio.latitude, studio.longitude),
    video: video ? { "@id": `${canonicalUrl}#video` } : undefined,
  };

  const videoDescription = studio.description
    ? toVideoDescription(studio.description)
    : `${studio.name}, a photography studio${studio.city ? ` in ${studio.city.name}` : ""}.`;

  return buildEntityGraph({
    canonicalUrl,
    name: studio.name,
    description: studio.description,
    main: business,
    breadcrumbItems,
    extras: [
      video ? buildVideoObject(video, canonicalUrl, `${studio.name} Video`, videoDescription) : null,
      buildFaqPage(studio.faqs, canonicalUrl),
    ],
  });
}

/** schema.org Person for an editor profile — the author entity for E-E-A-T. */
export function buildEditorPersonJsonLd(editor: PublicEditor) {
  return {
    "@type": "Person",
    "@id": `${absoluteUrl(`/editors/${editor.slug}`)}#person`,
    name: editor.name,
    url: absoluteUrl(`/editors/${editor.slug}`),
    jobTitle: editor.roleTitle ?? undefined,
    description: editor.bio ?? undefined,
    image: editor.imageUrl ? socialImageUrl(editor.imageUrl) : undefined,
    sameAs: editor.socials.length > 0 ? editor.socials.map((social) => social.url) : undefined,
    worksFor: organizationRef(),
  };
}

/** ProfilePage graph for an editor: the Person is the page's main entity. */
export function buildEditorPageJsonLd(editor: PublicEditor, breadcrumbItems: PathItem[]) {
  const url = absoluteUrl(`/editors/${editor.slug}`);
  return buildGraph([
    {
      "@type": "ProfilePage",
      "@id": `${url}#webpage`,
      url,
      name: editor.name,
      isPartOf: websiteRef(),
      breadcrumb: { "@id": `${url}#breadcrumb` },
      mainEntity: buildEditorPersonJsonLd(editor),
    },
    buildBreadcrumbNode(url, breadcrumbItems),
  ]);
}

/** Combined BlogPosting + BreadcrumbList (+ FAQPage when the post has FAQs)
 * structured data for a published blog article, as one JSON-LD script with
 * an @graph — mirrors buildLocationJsonLd/buildStudioJsonLd. `post` and
 * `breadcrumbItems` must be data the page already loaded via
 * getPublishedBlogPostBySlug; this never queries Supabase itself, and never
 * runs for a draft (the page 404s before this is ever called). */
export function buildBlogPostingJsonLd(
  post: PublicBlogPostDetail,
  breadcrumbItems: PathItem[],
  editor: PublicEditor | null = null,
) {
  const canonicalUrl = absoluteUrl(`/blog/${post.slug}`);

  const posting = {
    "@type": "BlogPosting",
    "@id": `${canonicalUrl}#article`,
    headline: post.title,
    description: post.excerpt ?? undefined,
    image: post.featuredImageUrl ? [socialImageUrl(post.featuredImageUrl)] : undefined,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    author: editor ? buildEditorPersonJsonLd(editor) : { "@type": "Person", name: post.authorName },
    publisher: organizationRef(),
    mainEntityOfPage: { "@id": `${canonicalUrl}#webpage` },
    url: canonicalUrl,
  };

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

  return buildEntityGraph({
    canonicalUrl,
    name: post.title,
    description: post.excerpt,
    main: posting,
    breadcrumbItems,
    extras: [buildFaqPage(mergedFaqs, canonicalUrl)],
  });
}

export function photographerListItems(photographers: { studioName: string; slug: string }[]): PathItem[] {
  return photographers.map((p) => ({ name: p.studioName, path: `/photographers/p/${p.slug}` }));
}

export function studioListItems(studios: { name: string; slug: string }[]): PathItem[] {
  return studios.map((s) => ({ name: s.name, path: `/studio/${s.slug}` }));
}

function buildItemList(name: string, items: PathItem[]) {
  return {
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
