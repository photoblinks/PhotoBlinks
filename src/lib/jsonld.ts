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

/** Place schema for a location detail page. Only includes fields that
 * actually exist in the database — no invented ratings/reviews/prices. */
export function buildPlaceJsonLd(location: {
  name: string;
  slug: string;
  description: string | null;
  images: string[];
  latitude: number | null;
  longitude: number | null;
  city: { name: string } | null;
  state: { name: string } | null;
  country: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "TouristAttraction",
    name: location.name,
    url: absoluteUrl(`/location/${location.slug}`),
    description: location.description ?? undefined,
    image: location.images.length > 0 ? location.images : undefined,
    address: {
      "@type": "PostalAddress",
      addressLocality: location.city?.name,
      addressRegion: location.state?.name,
      addressCountry: location.country,
    },
    geo:
      location.latitude != null && location.longitude != null
        ? {
            "@type": "GeoCoordinates",
            latitude: location.latitude,
            longitude: location.longitude,
          }
        : undefined,
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
  country: string;
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
      addressCountry: studio.country,
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
