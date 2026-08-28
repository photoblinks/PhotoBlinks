import type { ExtraDetails, PublicLocationDetail } from "./public-data";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

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
    description: "Discover beautiful photoshoot locations across Karnataka and Kerala.",
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
const DRONE_STATUS_SCHEMA_LABELS: Record<NonNullable<ExtraDetails["drone_status"]>, string> = {
  allowed: "Allowed",
  allowed_with_permission: "Allowed with Permission",
  restricted: "Restricted",
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

  add("Pre-Wedding Shoot", details.pre_wedding_shoot);
  add("Prior Booking", details.prior_booking);
  add("Camera Charges", details.camera_charges);
  add("Drone Status", details.drone_status ? DRONE_STATUS_SCHEMA_LABELS[details.drone_status] : null);
  add("Entry Fee", details.entry_fee);
  add("Best Season", details.best_season);
  add("Best Time", details.best_time);
  add("Changing Rooms", details.changing_rooms ? AVAILABILITY_BOOLEAN[details.changing_rooms] : null);
  add("Parking Facility", details.parking_facility ? AVAILABILITY_BOOLEAN[details.parking_facility] : null);
  add("Facilities", details.facilities);
  add("Access", details.access);
  add("Crowd", details.crowd);
  add("Privacy", details.privacy);

  return features;
}

function buildLocationAddress(location: {
  city: { name: string } | null;
  state: { name: string } | null;
  country: { name: string } | null;
}) {
  if (!location.city && !location.state && !location.country) return undefined;
  return {
    "@type": "PostalAddress",
    addressLocality: location.city?.name,
    addressRegion: location.state?.name,
    addressCountry: location.country?.name,
  };
}

/** Combined Place/TouristAttraction + BreadcrumbList structured data for a
 * location detail page, as a single JSON-LD script with an @graph — see
 * LocationJsonLd. Only includes fields that actually exist in the
 * database — no invented ratings/reviews/prices/permissions. `location`
 * and `breadcrumbItems` must be data the page already loaded/computed;
 * this never queries Supabase itself. */
export function buildLocationJsonLd(
  location: PublicLocationDetail,
  breadcrumbItems: { name: string; path: string }[],
) {
  const canonicalUrl = absoluteUrl(`/location/${location.slug}`);
  const amenityFeature = buildAmenityFeatures(location);
  const breadcrumbList = buildBreadcrumbList(breadcrumbItems);

  const place = {
    "@type": ["Place", "TouristAttraction"],
    "@id": `${canonicalUrl}#place`,
    name: location.name,
    url: canonicalUrl,
    description: location.description ?? undefined,
    image: location.images.length > 0 ? location.images : undefined,
    address: buildLocationAddress(location),
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
  };

  const graph: object[] = [
    place,
    {
      "@type": "BreadcrumbList",
      "@id": `${canonicalUrl}#breadcrumb`,
      itemListElement: breadcrumbList.itemListElement,
    },
  ];

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

/** LocalBusiness schema for a studio detail page. Only includes fields that
 * actually exist in the database. */
export function buildLocalBusinessJsonLd(studio: {
  name: string;
  slug: string;
  description: string | null;
  images: string[];
  latitude: number | null;
  longitude: number | null;
  city: { name: string } | null;
  state: { name: string } | null;
  country: { name: string } | null;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: studio.name,
    url: absoluteUrl(`/studio/${studio.slug}`),
    description: studio.description ?? undefined,
    image: studio.images.length > 0 ? studio.images : undefined,
    address: {
      "@type": "PostalAddress",
      addressLocality: studio.city?.name,
      addressRegion: studio.state?.name,
      addressCountry: studio.country?.name,
    },
    geo:
      studio.latitude != null && studio.longitude != null
        ? {
            "@type": "GeoCoordinates",
            latitude: studio.latitude,
            longitude: studio.longitude,
          }
        : undefined,
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
