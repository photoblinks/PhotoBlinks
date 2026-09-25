import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { haversineDistanceKm } from "@/lib/geo";
import { blogBlockSchema, parseEditorialBlocks, type BlogBlock, type EditorialBlock } from "@/lib/blog/content-blocks";
import { LOCATION_INFO_FIELDS, type LocationInfoTableConfig } from "@/lib/location-info-fields";

// This module is the ONLY place public pages read data from — it never
// imports the cookie-based admin client (src/lib/supabase/server.ts), so
// nothing here forces a route into dynamic rendering. Every exported
// data-fetching function below is wrapped in `unstable_cache` so its
// result is reused across requests/visitors for this long, instead of
// hitting Supabase on every request. A published/unpublished change made
// in the admin panel becomes visible on the public site within this
// window (or immediately, on routes that can't be statically cached at
// all because they read searchParams, e.g. the homepage and map filters).
export const PUBLIC_REVALIDATE_SECONDS = 60;

export type PricingType = "free" | "paid" | "unknown";

/** Optional call-to-action button shown below "Go to Location" — shared by
 * locations and studios. `action_value` holds a URL for book_now/website or
 * a phone number for call_now. */
export type ActionType = "book_now" | "website" | "call_now";

export type GeoRef = { name: string; slug: string };

export type DroneStatus = "allowed" | "allowed_with_permission" | "restricted" | "prohibited";

// The public Drone filter intentionally exposes only 3 buckets, matching
// the product's requested options — not all 4 stored `drone_status` values.
// "not_allowed" maps to the existing 'prohibited' value (an unambiguous
// match). The existing 'restricted' value is deliberately NOT folded into
// "not_allowed": the admin UI already treats "Restricted" as its own,
// less-absolute state distinct from "Prohibited" (see
// extra-details-list.tsx's DRONE_LABELS), so a location marked 'restricted'
// is excluded from all three filter buckets rather than being
// mis-classified — the same "don't guess" treatment already applied to
// null/unknown status.
export type DroneFilterOption = "allowed" | "allowed_with_permission" | "not_allowed";

function droneFilterToStatus(filter: DroneFilterOption): DroneStatus {
  return filter === "not_allowed" ? "prohibited" : filter;
}

export type PublicLocationCard = {
  id: string;
  name: string;
  cardName: string | null;
  slug: string;
  pricing_type: PricingType;
  price: number | null;
  category: { name: string; slug: string; sort_order: number } | null;
  country: GeoRef | null;
  state: GeoRef | null;
  city: GeoRef | null;
  primaryImageUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  updatedAt: string;
  distanceKm: number | null;
  // Only the one structured, unambiguous extra-detail field — used to build
  // the City/State + Category "facts strip" from data already loaded by
  // getPublishedLocations, with no second query. The other extra-details
  // fields (entry_fee, best_time, etc.) are free text and stay scoped to
  // the location detail page only — see src/lib/location-facts.ts.
  droneStatus: DroneStatus | null;
};

/** Groups locations by category slug, dropping any without a category.
 * Shared by every page that browses a set of locations organized into
 * per-category sections (homepage, state/city listing pages). */
export function groupLocationsByCategory(locations: PublicLocationCard[]) {
  const grouped = new Map<string, PublicLocationCard[]>();
  for (const location of locations) {
    const slug = location.category?.slug;
    if (!slug) continue;
    if (!grouped.has(slug)) grouped.set(slug, []);
    grouped.get(slug)!.push(location);
  }
  return grouped;
}

export const getSiteSettings = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("site_banner_images")
      .select("image_url")
      .order("sort_order");
    return { bannerImages: (data ?? []).map((row) => row.image_url) };
  },
  ["getSiteSettings"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
);

/** Optional per-record overrides for a country/state/city SEO landing
 * page — a banner image, H1, and title/description overrides. Same shape
 * as a category's page fields. */
export type GeoPageSeo = {
  image_url: string | null;
  h1_title: string | null;
  meta_title: string | null;
  meta_description: string | null;
};

export const getActiveCountries = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("countries")
      .select("id, name, slug, code, image_url, h1_title, meta_title, meta_description")
      .eq("is_active", true)
      .order("name");
    return data ?? [];
  },
  ["getActiveCountries"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
);

export const getActiveStates = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("states")
      .select(
        "id, name, slug, country_id, image_url, h1_title, meta_title, meta_description, countries(name, slug)",
      )
      .eq("is_active", true)
      .order("name");
    return (data ?? []).map((state) => ({
      id: state.id,
      name: state.name,
      slug: state.slug,
      country_id: state.country_id,
      image_url: state.image_url,
      h1_title: state.h1_title,
      meta_title: state.meta_title,
      meta_description: state.meta_description,
      country: Array.isArray(state.countries) ? (state.countries[0] ?? null) : state.countries,
    }));
  },
  ["getActiveStates"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
);

export const getActiveCities = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("cities")
      .select("id, name, slug, state_id, image_url, h1_title, meta_title, meta_description")
      .eq("is_active", true)
      .order("name");
    return data ?? [];
  },
  ["getActiveCities"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
);

export const getActiveCategories = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("categories")
      .select("id, name, slug, sort_order")
      .eq("is_active", true)
      .order("sort_order");
    return data ?? [];
  },
  ["getActiveCategories"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
);

export type PublicCategoryDetail = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  h1_title: string | null;
  meta_title: string | null;
  meta_description: string | null;
};

/** A single active category by slug, for the dedicated /category/[slug]
 * landing page — or null if it doesn't exist / isn't active. */
export const getCategoryBySlug = cache(
  unstable_cache(
    async (slug: string): Promise<PublicCategoryDetail | null> => {
      const supabase = createPublicClient();
      const { data } = await supabase
        .from("categories")
        .select("id, name, slug, description, image_url, h1_title, meta_title, meta_description")
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();
      return data ?? null;
    },
    ["getCategoryBySlug"],
    { revalidate: PUBLIC_REVALIDATE_SECONDS },
  ),
);

export type LocationCategorySeo = {
  meta_title: string | null;
  meta_description: string | null;
};

/** Optional admin SEO title/description override for a City + Category
 * page, keyed by the city and category it belongs to. Returns null when no
 * override exists — the public page then falls back to generated default
 * text. Tagged so an admin save/reset can target just this data with
 * `revalidateTag` instead of waiting out the revalidate window. */
export const getLocationCategorySeo = unstable_cache(
  async (cityId: string, categoryId: string): Promise<LocationCategorySeo | null> => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("location_category_seo")
      .select("meta_title, meta_description")
      .eq("city_id", cityId)
      .eq("category_id", categoryId)
      .maybeSingle();
    return data ?? null;
  },
  ["getLocationCategorySeo"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS, tags: ["location-category-seo"] },
);

export type LocationStateCategorySeo = {
  meta_title: string | null;
  meta_description: string | null;
};

/** Optional admin SEO title/description override for a State + Category
 * page, keyed by the state and category it belongs to. Mirrors
 * getLocationCategorySeo one geo level up. */
export const getLocationStateCategorySeo = unstable_cache(
  async (stateId: string, categoryId: string): Promise<LocationStateCategorySeo | null> => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("location_state_category_seo")
      .select("meta_title, meta_description")
      .eq("state_id", stateId)
      .eq("category_id", categoryId)
      .maybeSingle();
    return data ?? null;
  },
  ["getLocationStateCategorySeo"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS, tags: ["location-state-category-seo"] },
);

/** All published locations matching the given filters, newest first. Each
 * embeds its resolved category/state/city and primary (first) image.
 *
 * Note: when `near` (the visitor's own coordinates) is passed, it becomes
 * part of the cache key, so "near me" searches essentially never hit the
 * cache (each visitor's coordinates are unique) — an accepted MVP
 * trade-off rather than special-casing it out of the cached arguments. */
export const getPublishedLocations = unstable_cache(
  async (filters?: {
    categoryId?: string;
    countryId?: string;
    stateId?: string;
    cityId?: string;
    pricingType?: PricingType;
    droneStatus?: DroneFilterOption;
    /** Free-text search against the location name. */
    search?: string;
    near?: { latitude: number; longitude: number };
    /** Fetch exactly these published locations (favourites/shared-collection
     * card lookups) instead of filtering by geography/category. */
    locationIds?: string[];
  }): Promise<PublicLocationCard[]> => {
    const supabase = createPublicClient();

    let query = supabase
      .from("locations")
      .select(
        "id, name, card_name, slug, pricing_type, price, latitude, longitude, updated_at, drone_status, categories(name, slug, sort_order), countries(name, slug), states(name, slug), cities(name, slug), location_images(image_url, sort_order)",
      )
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    if (filters?.categoryId) query = query.eq("category_id", filters.categoryId);
    if (filters?.countryId) query = query.eq("country_id", filters.countryId);
    if (filters?.stateId) query = query.eq("state_id", filters.stateId);
    if (filters?.cityId) query = query.eq("city_id", filters.cityId);
    if (filters?.pricingType) query = query.eq("pricing_type", filters.pricingType);
    if (filters?.droneStatus) query = query.eq("drone_status", droneFilterToStatus(filters.droneStatus));
    if (filters?.search) query = query.ilike("name", `%${filters.search}%`);
    if (filters?.locationIds) query = query.in("id", filters.locationIds);

    const { data } = await query;

    const results = (data ?? []).map((location) => {
      const primaryImageUrl =
        [...(location.location_images ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0]
          ?.image_url ?? null;

      const distanceKm =
        filters?.near && location.latitude != null && location.longitude != null
          ? haversineDistanceKm(filters.near, { latitude: location.latitude, longitude: location.longitude })
          : null;

      return {
        id: location.id,
        name: location.name,
        cardName: location.card_name,
        slug: location.slug,
        pricing_type: location.pricing_type,
        price: location.price,
        category: Array.isArray(location.categories) ? (location.categories[0] ?? null) : location.categories,
        country: Array.isArray(location.countries) ? (location.countries[0] ?? null) : location.countries,
        state: Array.isArray(location.states) ? (location.states[0] ?? null) : location.states,
        city: Array.isArray(location.cities) ? (location.cities[0] ?? null) : location.cities,
        primaryImageUrl,
        latitude: location.latitude,
        longitude: location.longitude,
        updatedAt: location.updated_at,
        distanceKm,
        droneStatus: location.drone_status,
      };
    });

    if (filters?.near) {
      results.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    }

    return results;
  },
  ["getPublishedLocations"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
);

/** Count of currently published locations — used for the homepage's
 * SEO/GEO "about" copy so the active-location figure stays accurate
 * without fetching every location row. */
export const getPublishedLocationCount = unstable_cache(
  async (): Promise<number> => {
    const supabase = createPublicClient();
    const { count } = await supabase
      .from("locations")
      .select("id", { count: "exact", head: true })
      .eq("is_published", true);
    return count ?? 0;
  },
  ["getPublishedLocationCount"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
);

/** First image of the most recently published location — fallback art for
 * the homepage's SEO/GEO about section when no site banner image is set. */
export const getFeaturedLocationImageUrl = unstable_cache(
  async (): Promise<string | null> => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("locations")
      .select("location_images(image_url, sort_order)")
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (
      [...(data?.location_images ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0]
        ?.image_url ?? null
    );
  },
  ["getFeaturedLocationImageUrl"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
);

/** Resolves a share token to the ids of that owner's currently-published
 * favourited locations, via the get_shared_favourite_location_ids()
 * SECURITY DEFINER function (see 20260904020000_favourites.sql) — the only
 * public entry point into another user's favourites, gated on an exact
 * token match, returning nothing but location ids. Deliberately NOT
 * unstable_cache-wrapped, unlike every other export here: a shared
 * collection must reflect the owner's current favourites live (an owner
 * removing a location must disappear from the shared link immediately, not
 * after a cache window) — see the /favourites/share/[token] page, which
 * also opts out of route-level caching for the same reason. */
export async function getSharedFavouriteLocationIds(token: string): Promise<string[]> {
  const supabase = createPublicClient();
  const { data } = await supabase.rpc("get_shared_favourite_location_ids", { p_token: token });
  return (data ?? []).map((row: { location_id: string }) => row.location_id);
}

/** 32 random bytes, base64url — the only shape a real share token can have. */
const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export type SharedLocationCollection = {
  name: string;
  displayName: string;
  studioName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  phoneNumber: string;
  whatsappNumber: string | null;
  /** Currently-published location ids, in the photographer's saved order. */
  locationIds: string[];
};

/** Resolves a photographer share token (/c/[token]) through the
 * get_shared_location_collection() SECURITY DEFINER function — the
 * collection tables have no public read policy (see
 * 20260915000000_photographer_location_collections.sql). Returns null for an
 * unknown/deleted token or a suspended photographer. Not unstable_cache-
 * wrapped, same reason as getSharedFavouriteLocationIds: edits and deletes
 * must take effect on the shared link immediately. React cache() only dedupes
 * the metadata + page reads within one request. */
export const getSharedLocationCollection = cache(async (token: string): Promise<SharedLocationCollection | null> => {
  if (!SHARE_TOKEN_RE.test(token)) return null;
  const supabase = createPublicClient();
  const { data } = await supabase.rpc("get_shared_location_collection", { p_token: token }).maybeSingle<{
    name: string;
    display_name: string;
    studio_name: string | null;
    bio: string | null;
    avatar_url: string | null;
    phone_number: string;
    whatsapp_number: string | null;
    location_ids: string[];
  }>();
  if (!data) return null;
  return {
    name: data.name,
    displayName: data.display_name,
    studioName: data.studio_name,
    bio: data.bio,
    avatarUrl: data.avatar_url,
    phoneNumber: data.phone_number,
    whatsappNumber: data.whatsapp_number,
    locationIds: data.location_ids ?? [],
  };
});

/** True only when `token` is an active share link AND the published location
 * with exactly `slug` belongs to it. Not cached, for the same reason as
 * getSharedLocationCollection. */
export async function sharedLocationCollectionHasLocation(token: string, slug: string): Promise<boolean> {
  if (!SHARE_TOKEN_RE.test(token)) return false;
  const supabase = createPublicClient();
  const { data } = await supabase.rpc("shared_location_collection_has_location", {
    p_token: token,
    p_slug: slug,
  });
  return data === true;
}

export const LOCATION_COMMENTS_PAGE_SIZE = 10;

export type PublicLocationComment = {
  id: string;
  comment: string | null;
  rating: number;
  created_at: string;
  authorName: string;
};

type ApprovedCommentRow = {
  id: string;
  comment: string | null;
  rating: number;
  created_at: string;
  author_name: string;
};

export type LocationRatingSummary = { average: number; count: number };

/** Approved comments for a location, newest first — pending/rejected rows
 * are never reachable here (RLS + the get_approved_location_comments()
 * function's own hardcoded `status = 'approved'` filter, doubly enforced).
 * Same 60s revalidate window as every other public read, so a freshly
 * admin-approved comment appears within that window, not instantly, and a
 * pending one can never leak through a stale cache (it's simply never part
 * of this result set until approved). */
export const getApprovedLocationComments = unstable_cache(
  async (locationId: string, offset: number = 0): Promise<PublicLocationComment[]> => {
    const supabase = createPublicClient();
    const { data } = await supabase.rpc("get_approved_location_comments", {
      p_location_id: locationId,
      p_limit: LOCATION_COMMENTS_PAGE_SIZE,
      p_offset: offset,
    });
    return ((data ?? []) as ApprovedCommentRow[]).map((row) => ({
      id: row.id,
      comment: row.comment,
      rating: row.rating,
      created_at: row.created_at,
      authorName: row.author_name,
    }));
  },
  ["getApprovedLocationComments"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
);

export const getApprovedLocationCommentCount = unstable_cache(
  async (locationId: string): Promise<number> => {
    const supabase = createPublicClient();
    const { count } = await supabase
      .from("location_comments")
      .select("id", { count: "exact", head: true })
      .eq("location_id", locationId)
      .eq("status", "approved");
    return count ?? 0;
  },
  ["getApprovedLocationCommentCount"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
);

/** Average + count of a location's approved ratings — only ever computed
 * from moderated (approved) rows, same trust boundary as comment display.
 * Returns count 0 / average 0 when nothing has been approved yet; callers
 * must treat count === 0 as "no rating to show", never render a fabricated
 * default score. */
export const getLocationRatingSummary = unstable_cache(
  async (locationId: string): Promise<LocationRatingSummary> => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .rpc("get_location_rating_summary", { p_location_id: locationId })
      .maybeSingle();
    const row = data as { average: number | null; count: number | null } | null;
    return { average: row?.average ?? 0, count: row?.count ?? 0 };
  },
  ["getLocationRatingSummary"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
);

export type PublicStudioCard = {
  id: string;
  name: string;
  cardName: string | null;
  slug: string;
  country: GeoRef | null;
  state: GeoRef | null;
  city: GeoRef | null;
  primaryImageUrl: string | null;
  fromPrice: number | null;
  updatedAt: string;
};

/** All published studios matching the given filters, newest first. Each
 * embeds its resolved state/city, primary (first) image, and the lowest of
 * its saved pricing options (if any) for card display. */
export const getPublishedStudios = unstable_cache(
  async (filters?: {
    countryId?: string;
    stateId?: string;
    cityId?: string;
  }): Promise<PublicStudioCard[]> => {
    const supabase = createPublicClient();

    let query = supabase
      .from("studios")
      .select(
        "id, name, card_name, slug, updated_at, countries(name, slug), states(name, slug), cities(name, slug), studio_images(image_url, sort_order), studio_pricing_options(price)",
      )
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    if (filters?.countryId) query = query.eq("country_id", filters.countryId);
    if (filters?.stateId) query = query.eq("state_id", filters.stateId);
    if (filters?.cityId) query = query.eq("city_id", filters.cityId);

    const { data } = await query;

    return (data ?? []).map((studio) => {
      const primaryImageUrl =
        [...(studio.studio_images ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0]
          ?.image_url ?? null;
      const prices = (studio.studio_pricing_options ?? []).map((o) => o.price);

      return {
        id: studio.id,
        name: studio.name,
        cardName: studio.card_name,
        slug: studio.slug,
        country: Array.isArray(studio.countries) ? (studio.countries[0] ?? null) : studio.countries,
        state: Array.isArray(studio.states) ? (studio.states[0] ?? null) : studio.states,
        city: Array.isArray(studio.cities) ? (studio.cities[0] ?? null) : studio.cities,
        primaryImageUrl,
        fromPrice: prices.length > 0 ? Math.min(...prices) : null,
        updatedAt: studio.updated_at,
      };
    });
  },
  ["getPublishedStudios"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
);

/** Availability dropdown used by both Changing Rooms and Parking Facility. */
export type AvailabilityStatus = "available" | "not_available";

/** Optional detail fields shared by locations and studios — set by the
 * admin, shown on the public page only when present. Grouped into Shoot
 * Details, Pricing & Timing, Amenities, and Environment. */
export type ExtraDetails = {
  // Shoot Details
  pre_wedding_shoot: "allowed" | "conditional" | "prohibited" | null;
  pre_wedding_shoot_condition: string | null;
  prior_booking: string | null;
  drone_status: "allowed" | "allowed_with_permission" | "restricted" | "prohibited" | null;
  drone_permission: string | null;
  recommended_outfits: string | null;
  // Pricing & Timing
  entry_fee: string | null;
  shoot_permit_fee: string | null;
  vehicle_parking_fee: string | null;
  best_season: string | null;
  best_time: string | null;
  // Amenities
  road_accessibility: string | null;
  parking_facility: AvailabilityStatus | null;
  boating_available: string | null;
  changing_rooms: AvailabilityStatus | null;
  restrooms: string | null;
  facilities: string | null;
  // Environment
  access: string | null;
  crowd: string | null;
  privacy: string | null;
  weather_lighting: string | null;
};

const EXTRA_DETAIL_COLUMNS =
  "pre_wedding_shoot, pre_wedding_shoot_condition, prior_booking, drone_status, drone_permission, recommended_outfits, entry_fee, shoot_permit_fee, vehicle_parking_fee, best_season, best_time, road_accessibility, parking_facility, boating_available, changing_rooms, restrooms, facilities, access, crowd, privacy, weather_lighting";

export type PublicLocationDetail = ExtraDetails & {
  id: string;
  name: string;
  cardName: string | null;
  slug: string;
  description: string | null;
  pricing_type: PricingType;
  price: number | null;
  price_note: string | null;
  action_type: ActionType | null;
  action_value: string | null;
  meta_title: string | null;
  meta_description: string | null;
  map_url: string | null;
  latitude: number | null;
  longitude: number | null;
  youtube_url: string | null;
  category: { name: string; slug: string } | null;
  country: GeoRef | null;
  state: GeoRef | null;
  state_id: string | null;
  city: GeoRef | null;
  images: string[];
  /** Admin-provided per-image alt text, same order/length as `images`.
   * `null` where an image has no caption of its own. */
  imageCaptions: (string | null)[];
  faqs: { question: string; answer: string }[];
};

/** A single published location by slug, with every field the detail page
 * needs, or null if it doesn't exist / isn't published (RLS already hides
 * unpublished rows from the anon/public read policy). */
export const getPublishedLocationBySlug = cache(
  unstable_cache(
    async (slug: string): Promise<PublicLocationDetail | null> => {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("locations")
    .select(
      `id, name, card_name, slug, description, pricing_type, price, price_note, action_type, action_value, meta_title, meta_description, map_url, latitude, longitude, youtube_url, state_id, ${EXTRA_DETAIL_COLUMNS}, categories(name, slug), countries(name, slug), states(name, slug), cities(name, slug), location_images(image_url, alt_text, sort_order), location_faqs(question, answer, sort_order)`,
    )
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    cardName: data.card_name,
    slug: data.slug,
    description: data.description,
    pricing_type: data.pricing_type,
    price: data.price,
    price_note: data.price_note,
    action_type: data.action_type,
    action_value: data.action_value,
    meta_title: data.meta_title,
    meta_description: data.meta_description,
    map_url: data.map_url,
    latitude: data.latitude,
    longitude: data.longitude,
    youtube_url: data.youtube_url,
    pre_wedding_shoot: data.pre_wedding_shoot,
    pre_wedding_shoot_condition: data.pre_wedding_shoot_condition,
    prior_booking: data.prior_booking,
    drone_status: data.drone_status,
    drone_permission: data.drone_permission,
    recommended_outfits: data.recommended_outfits,
    entry_fee: data.entry_fee,
    shoot_permit_fee: data.shoot_permit_fee,
    vehicle_parking_fee: data.vehicle_parking_fee,
    best_season: data.best_season,
    best_time: data.best_time,
    road_accessibility: data.road_accessibility,
    parking_facility: data.parking_facility,
    boating_available: data.boating_available,
    changing_rooms: data.changing_rooms,
    restrooms: data.restrooms,
    facilities: data.facilities,
    access: data.access,
    crowd: data.crowd,
    privacy: data.privacy,
    weather_lighting: data.weather_lighting,
    category: Array.isArray(data.categories) ? (data.categories[0] ?? null) : data.categories,
    country: Array.isArray(data.countries) ? (data.countries[0] ?? null) : data.countries,
    state: Array.isArray(data.states) ? (data.states[0] ?? null) : data.states,
    state_id: data.state_id,
    city: Array.isArray(data.cities) ? (data.cities[0] ?? null) : data.cities,
    images: [...(data.location_images ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((img) => img.image_url),
    imageCaptions: [...(data.location_images ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((img) => img.alt_text?.trim() || null),
    faqs: [...(data.location_faqs ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((faq) => ({ question: faq.question, answer: faq.answer })),
  };
    },
    ["getPublishedLocationBySlug"],
    { revalidate: PUBLIC_REVALIDATE_SECONDS },
  ),
);

export type PublicSponsoredPhotographer = {
  id: string;
  photography_name: string;
  image_url: string;
  title: string;
  description: string | null;
  phone_number: string;
  whatsapp_number: string;
};

/** The active (non-expired) sponsored photographer for a state, or null if
 * none is assigned / the assignment has expired. RLS already restricts the
 * public-read policy to `expiry_date >= current_date` and the DB enforces
 * at most one active row per state, so this is a single unfiltered lookup —
 * no client-side date filtering. Shares the same 60s revalidate window as
 * the location detail page it's rendered on, so an expiring card disappears
 * within that window like every other public data change. */
export const getActiveSponsoredPhotographerByState = cache(
  unstable_cache(
    async (stateId: string): Promise<PublicSponsoredPhotographer | null> => {
      const supabase = createPublicClient();
      const { data } = await supabase
        .from("sponsored_photographers")
        .select("id, photography_name, image_url, title, description, phone_number, whatsapp_number")
        .eq("state_id", stateId)
        .maybeSingle();

      return data;
    },
    ["getActiveSponsoredPhotographerByState"],
    { revalidate: PUBLIC_REVALIDATE_SECONDS },
  ),
);

/** Every currently-active sponsored photographer, with the state they're
 * assigned to — for the /llms-full.txt dump only (a single small bulk read,
 * unlike the per-state getActiveSponsoredPhotographerByState above, which
 * stays scoped to the location detail page it was built for). Same public
 * fields already rendered on SponsoredPhotographerCard — nothing new is
 * exposed. RLS already restricts the public-read policy to
 * `expiry_date >= current_date`. */
export const getActiveSponsoredPhotographers = unstable_cache(
  async (): Promise<(PublicSponsoredPhotographer & { state: GeoRef | null })[]> => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("sponsored_photographers")
      .select(
        "id, photography_name, image_url, title, description, phone_number, whatsapp_number, states(name, slug)",
      );
    return (data ?? []).map((row) => ({
      id: row.id,
      photography_name: row.photography_name,
      image_url: row.image_url,
      title: row.title,
      description: row.description,
      phone_number: row.phone_number,
      whatsapp_number: row.whatsapp_number,
      state: Array.isArray(row.states) ? (row.states[0] ?? null) : row.states,
    }));
  },
  ["getActiveSponsoredPhotographers"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
);

export type PublicStudioDetail = ExtraDetails & {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  action_type: ActionType | null;
  action_value: string | null;
  meta_title: string | null;
  meta_description: string | null;
  map_url: string | null;
  latitude: number | null;
  longitude: number | null;
  youtube_url: string | null;
  country: GeoRef | null;
  state: GeoRef | null;
  state_id: string | null;
  city: GeoRef | null;
  images: string[];
  /** Admin-provided per-image alt text, same order/length as `images`.
   * `null` where an image has no caption of its own. */
  imageCaptions: (string | null)[];
  pricingOptions: { label: string; price: number }[];
  faqs: { question: string; answer: string }[];
};

/** A single published studio by slug, with images and pricing options in
 * their saved sort order, or null if it doesn't exist / isn't published. */
export const getPublishedStudioBySlug = cache(
  unstable_cache(
    async (slug: string): Promise<PublicStudioDetail | null> => {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("studios")
    .select(
      `id, name, slug, description, action_type, action_value, meta_title, meta_description, map_url, latitude, longitude, youtube_url, state_id, ${EXTRA_DETAIL_COLUMNS}, countries(name, slug), states(name, slug), cities(name, slug), studio_images(image_url, alt_text, sort_order), studio_pricing_options(label, price, sort_order), studio_faqs(question, answer, sort_order)`,
    )
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    description: data.description,
    action_type: data.action_type,
    action_value: data.action_value,
    meta_title: data.meta_title,
    meta_description: data.meta_description,
    map_url: data.map_url,
    latitude: data.latitude,
    longitude: data.longitude,
    youtube_url: data.youtube_url,
    pre_wedding_shoot: data.pre_wedding_shoot,
    pre_wedding_shoot_condition: data.pre_wedding_shoot_condition,
    prior_booking: data.prior_booking,
    drone_status: data.drone_status,
    drone_permission: data.drone_permission,
    recommended_outfits: data.recommended_outfits,
    entry_fee: data.entry_fee,
    shoot_permit_fee: data.shoot_permit_fee,
    vehicle_parking_fee: data.vehicle_parking_fee,
    best_season: data.best_season,
    best_time: data.best_time,
    road_accessibility: data.road_accessibility,
    parking_facility: data.parking_facility,
    boating_available: data.boating_available,
    changing_rooms: data.changing_rooms,
    restrooms: data.restrooms,
    facilities: data.facilities,
    access: data.access,
    crowd: data.crowd,
    privacy: data.privacy,
    weather_lighting: data.weather_lighting,
    country: Array.isArray(data.countries) ? (data.countries[0] ?? null) : data.countries,
    state: Array.isArray(data.states) ? (data.states[0] ?? null) : data.states,
    state_id: data.state_id,
    city: Array.isArray(data.cities) ? (data.cities[0] ?? null) : data.cities,
    images: [...(data.studio_images ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((img) => img.image_url),
    imageCaptions: [...(data.studio_images ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((img) => img.alt_text?.trim() || null),
    pricingOptions: [...(data.studio_pricing_options ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((o) => ({ label: o.label, price: o.price })),
    faqs: [...(data.studio_faqs ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((faq) => ({ question: faq.question, answer: faq.answer })),
  };
    },
    ["getPublishedStudioBySlug"],
    { revalidate: PUBLIC_REVALIDATE_SECONDS },
  ),
);

/** Approved photographer photo visible on a public location page.
 * Only the fields returned by get_approved_photographer_photos() — all other
 * submission columns (photographer_id, storage_key, reviewed_by, etc.) are
 * intentionally excluded from this public type. */
export type PublicPhotographerPhoto = {
  id: string;
  image_url: string;
  title: string;
  description: string | null;
  phone_number: string;
};

/** Approved photographer-submitted photos for a published location.
 * Fetched via the get_approved_photographer_photos() security-definer RPC
 * so the public (anon) client never touches the submissions table directly —
 * the function enforces status='approved' and location is_published=true
 * and returns only the public-safe field subset. */
export const getApprovedPhotographerPhotos = cache(
  unstable_cache(
    async (locationId: string): Promise<PublicPhotographerPhoto[]> => {
      const supabase = createPublicClient();
      const { data } = await supabase.rpc("get_approved_photographer_photos", {
        p_location_id: locationId,
      });
      return (data as PublicPhotographerPhoto[]) ?? [];
    },
    ["getApprovedPhotographerPhotos"],
    { revalidate: PUBLIC_REVALIDATE_SECONDS },
  ),
);

// ---------------------------------------------------------------------------
// Blog (Phase 3 — public read layer)
// ---------------------------------------------------------------------------
//
// Every function below reads only published rows: blog_posts.status =
// 'published' is always an explicit filter here even though RLS already
// enforces it too — belt and suspenders, and it keeps the intent readable at
// the call site. blog_faqs / blog_post_tags / blog_post_locations have no
// status column of their own; their own RLS policies (see
// 20260911000000_blog_system.sql / _fixes.sql) already restrict anon/public
// reads to rows whose parent post (and, for blog_post_locations, whose
// referenced location) is published, so a plain nested select here can't
// leak a draft's FAQs/tags/locations or a link to an unpublished location.

const BLOG_POST_CARD_COLUMNS =
  "id, slug, title, excerpt, featured_image_url, featured_image_alt, is_featured, published_at, blog_categories(name, slug)";

export type PublicBlogPostCard = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  featuredImageUrl: string | null;
  featuredImageAlt: string | null;
  isFeatured: boolean;
  publishedAt: string;
  category: { name: string; slug: string } | null;
};

type BlogPostCardRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  featured_image_url: string | null;
  featured_image_alt: string | null;
  is_featured: boolean;
  published_at: string | null;
  blog_categories: { name: string; slug: string } | { name: string; slug: string }[] | null;
};

function toBlogPostCard(row: BlogPostCardRow): PublicBlogPostCard {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    featuredImageUrl: row.featured_image_url,
    featuredImageAlt: row.featured_image_alt,
    isFeatured: row.is_featured,
    // Never null for a published row (the publish trigger guarantees it),
    // but fall back defensively rather than pass null through the public type.
    publishedAt: row.published_at ?? new Date(0).toISOString(),
    category: Array.isArray(row.blog_categories) ? (row.blog_categories[0] ?? null) : row.blog_categories,
  };
}

export const BLOG_LIST_PAGE_SIZE = 12;

/** One page of published posts, newest first, plus the total published
 * count for pagination — a bounded, offset-based listing rather than
 * fetching every post, since the blog can grow past a single page. */
export const getPublishedBlogPostsPage = unstable_cache(
  async (page: number): Promise<{ posts: PublicBlogPostCard[]; total: number }> => {
    const supabase = createPublicClient();
    const from = Math.max(0, page - 1) * BLOG_LIST_PAGE_SIZE;
    const to = from + BLOG_LIST_PAGE_SIZE - 1;

    const { data, count } = await supabase
      .from("blog_posts")
      .select(BLOG_POST_CARD_COLUMNS, { count: "exact" })
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .range(from, to);

    return { posts: (data ?? []).map(toBlogPostCard), total: count ?? 0 };
  },
  ["getPublishedBlogPostsPage"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
);

/** Featured published posts for the /blog hero rail. Bounded to `limit`. */
export const getFeaturedBlogPosts = unstable_cache(
  async (limit = 3): Promise<PublicBlogPostCard[]> => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("blog_posts")
      .select(BLOG_POST_CARD_COLUMNS)
      .eq("status", "published")
      .eq("is_featured", true)
      .order("published_at", { ascending: false })
      .limit(limit);
    return (data ?? []).map(toBlogPostCard);
  },
  ["getFeaturedBlogPosts"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
);

/** Active blog categories for /blog's category navigation. */
export const getActiveBlogCategories = unstable_cache(
  async (): Promise<{ id: string; name: string; slug: string }[]> => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("blog_categories")
      .select("id, name, slug")
      .eq("is_active", true)
      .order("sort_order");
    return data ?? [];
  },
  ["getActiveBlogCategories"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
);

export type PublicBlogCategoryDetail = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
};

/** A single active blog category by slug, for the dedicated
 * /blog/category/[slug] landing page — or null if it doesn't exist / isn't
 * active. Same shape as location's getCategoryBySlug. */
export const getBlogCategoryBySlug = cache(
  unstable_cache(
    async (slug: string): Promise<PublicBlogCategoryDetail | null> => {
      const supabase = createPublicClient();
      const { data } = await supabase
        .from("blog_categories")
        .select("id, name, slug, description, is_active")
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();
      return data ?? null;
    },
    ["getBlogCategoryBySlug"],
    { revalidate: PUBLIC_REVALIDATE_SECONDS },
  ),
);

/** Published posts in one category, newest first. Returns an empty array
 * (not an error) for an unknown/inactive category slug. */
export const getBlogPostsByCategorySlug = unstable_cache(
  async (categorySlug: string, limit = BLOG_LIST_PAGE_SIZE): Promise<PublicBlogPostCard[]> => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("blog_posts")
      .select(`${BLOG_POST_CARD_COLUMNS}, blog_categories!inner(name, slug)`)
      .eq("status", "published")
      .eq("blog_categories.slug", categorySlug)
      .order("published_at", { ascending: false })
      .limit(limit);
    return (data ?? []).map(toBlogPostCard);
  },
  ["getBlogPostsByCategorySlug"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
);

/** Published posts carrying one tag, newest first. Returns an empty array
 * for an unknown/inactive tag slug. */
export const getBlogPostsByTagSlug = unstable_cache(
  async (tagSlug: string, limit = BLOG_LIST_PAGE_SIZE): Promise<PublicBlogPostCard[]> => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("blog_posts")
      .select(`${BLOG_POST_CARD_COLUMNS}, blog_post_tags!inner(blog_tags!inner(slug))`)
      .eq("status", "published")
      .eq("blog_post_tags.blog_tags.slug", tagSlug)
      .order("published_at", { ascending: false })
      .limit(limit);
    return (data ?? []).map(toBlogPostCard);
  },
  ["getBlogPostsByTagSlug"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
);

/** Published posts linked to a given location (blog_post_locations), newest
 * first — used on the location detail page to surface related articles. */
export const getBlogPostsForLocation = cache(
  unstable_cache(
    async (locationId: string, limit = 6): Promise<PublicBlogPostCard[]> => {
      const supabase = createPublicClient();
      const { data } = await supabase
        .from("blog_posts")
        .select(`${BLOG_POST_CARD_COLUMNS}, blog_post_locations!inner(location_id)`)
        .eq("status", "published")
        .eq("blog_post_locations.location_id", locationId)
        .order("published_at", { ascending: false })
        .limit(limit);
      return (data ?? []).map(toBlogPostCard);
    },
    ["getBlogPostsForLocation"],
    { revalidate: PUBLIC_REVALIDATE_SECONDS },
  ),
);

/** Every published post's slug + updated_at, for the sitemap only — the
 * one caller allowed to want the full published set rather than a bounded
 * page (mirrors getPublishedLocations/getPublishedStudios, which are the
 * same kind of unbounded sitemap source). Never includes drafts. */
export const getPublishedBlogPostsForSitemap = unstable_cache(
  async (): Promise<{ slug: string; updatedAt: string }[]> => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("blog_posts")
      .select("slug, updated_at")
      .eq("status", "published")
      .order("published_at", { ascending: false });
    return (data ?? []).map((row) => ({ slug: row.slug, updatedAt: row.updated_at }));
  },
  ["getPublishedBlogPostsForSitemap"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
);

export type PublicBlogPostForLlms = {
  slug: string;
  title: string;
  excerpt: string | null;
  publishedAt: string;
  updatedAt: string;
  category: { name: string; slug: string } | null;
};

/** Every published post's title/excerpt/dates, for the /llms-full.txt
 * machine-readable dump — the unbounded sibling of getPublishedBlogPostsPage
 * (which is deliberately paginated for the /blog UI). Never includes drafts. */
export const getPublishedBlogPostsForLlms = unstable_cache(
  async (): Promise<PublicBlogPostForLlms[]> => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("blog_posts")
      .select("slug, title, excerpt, published_at, updated_at, blog_categories(name, slug)")
      .eq("status", "published")
      .order("published_at", { ascending: false });
    return (data ?? []).map((row) => ({
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt,
      publishedAt: row.published_at ?? new Date(0).toISOString(),
      updatedAt: row.updated_at,
      category: Array.isArray(row.blog_categories) ? (row.blog_categories[0] ?? null) : row.blog_categories,
    }));
  },
  ["getPublishedBlogPostsForLlms"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
);

export type PublicBlogPostDetail = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: BlogBlock[];
  authorName: string;
  featuredImageUrl: string | null;
  featuredImageAlt: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  isFeatured: boolean;
  categoryId: string | null;
  category: { name: string; slug: string } | null;
  publishedAt: string;
  updatedAt: string;
  faqs: { question: string; answer: string }[];
  tagIds: string[];
  tags: { id: string; name: string; slug: string }[];
  locationIds: string[];
  locations: { id: string; name: string; slug: string }[];
};

/** Per-block fail-closed validation for blog_posts.content. The array is
 * never trusted as a whole: each block is validated individually against
 * blogBlockSchema, valid blocks are kept in their original order, and only
 * invalid blocks are dropped. A non-array (or entirely invalid) content
 * value yields an empty array — the renderer only ever receives BlogBlock[]
 * and never renders unvalidated data. The 200-block cap mirrors
 * blogContentSchema's bound so a single post can't be turned into an
 * unbounded render payload. */
function parsePublicBlogContent(value: unknown): BlogBlock[] {
  if (!Array.isArray(value)) return [];
  const blocks: BlogBlock[] = [];
  for (const block of value) {
    if (blocks.length >= 200) break;
    const parsed = blogBlockSchema.safeParse(block);
    if (parsed.success) blocks.push(parsed.data);
  }
  return blocks;
}

/** A single published post by slug, with everything the article page and
 * its JSON-LD need, or null if it doesn't exist / isn't published (RLS
 * already hides drafts from the anon read policy — this adds the same
 * `status = 'published'` filter explicitly rather than relying on RLS
 * alone). `content` is re-validated here per block with blogBlockSchema —
 * the CMS already validates on write, but the renderer must never trust a
 * JSONB blob it didn't just write itself. Valid blocks are kept in order;
 * each invalid block is dropped individually (fail closed per block), so
 * one corrupted block can never erase its valid neighbors. A non-array
 * content value renders as an empty content array rather than crashing the
 * page. */
export const getPublishedBlogPostBySlug = cache(
  unstable_cache(
    async (slug: string): Promise<PublicBlogPostDetail | null> => {
      const supabase = createPublicClient();
      const { data } = await supabase
        .from("blog_posts")
        .select(
          "id, slug, title, excerpt, content, author_name, featured_image_url, featured_image_alt, meta_title, meta_description, is_featured, category_id, published_at, updated_at, blog_categories(name, slug), blog_faqs(question, answer, sort_order), blog_post_tags(tag_id, blog_tags(id, name, slug)), blog_post_locations(location_id, locations(id, name, slug))",
        )
        .eq("slug", slug)
        .eq("status", "published")
        .maybeSingle();

      if (!data) return null;

      const tagRows = data.blog_post_tags ?? [];
      const locationRows = data.blog_post_locations ?? [];

      return {
        id: data.id,
        slug: data.slug,
        title: data.title,
        excerpt: data.excerpt,
        content: parsePublicBlogContent(data.content),
        authorName: data.author_name,
        featuredImageUrl: data.featured_image_url,
        featuredImageAlt: data.featured_image_alt,
        metaTitle: data.meta_title,
        metaDescription: data.meta_description,
        isFeatured: data.is_featured,
        categoryId: data.category_id,
        category: Array.isArray(data.blog_categories) ? (data.blog_categories[0] ?? null) : data.blog_categories,
        publishedAt: data.published_at ?? new Date(0).toISOString(),
        updatedAt: data.updated_at,
        faqs: [...(data.blog_faqs ?? [])]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((f) => ({ question: f.question, answer: f.answer })),
        tagIds: tagRows.map((t) => t.tag_id),
        tags: tagRows
          .map((t) => (Array.isArray(t.blog_tags) ? (t.blog_tags[0] ?? null) : t.blog_tags))
          .filter((t): t is { id: string; name: string; slug: string } => t != null),
        locationIds: locationRows.map((l) => l.location_id),
        // A location row is only present here at all when it passed
        // blog_post_locations' own RLS (parent post published AND the
        // location itself published) — see the module comment above.
        locations: locationRows
          .map((l) => (Array.isArray(l.locations) ? (l.locations[0] ?? null) : l.locations))
          .filter((l): l is { id: string; name: string; slug: string } => l != null),
      };
    },
    ["getPublishedBlogPostBySlug"],
    { revalidate: PUBLIC_REVALIDATE_SECONDS },
  ),
);

/** Lightweight related-post strategy: published posts (excluding the post
 * itself) that share the same category, or at least one tag, or at least
 * one linked location — ranked by number of overlapping signals, capped to
 * `limit`. Three bounded queries (one per signal, each already limited and
 * filtered to `status = 'published'`), never an unbounded scan or a
 * cross-post similarity computation — this is a relationship lookup, not a
 * recommendation engine. */
export const getRelatedBlogPosts = cache(
  unstable_cache(
    async (params: {
      postId: string;
      categorySlug: string | null;
      tagSlugs: string[];
      locationIds: string[];
      limit?: number;
    }): Promise<PublicBlogPostCard[]> => {
      const { postId, categorySlug, tagSlugs, locationIds, limit = 4 } = params;
      const supabase = createPublicClient();
      const CANDIDATE_CAP = 12;

      const scored = new Map<string, { row: BlogPostCardRow; score: number }>();
      const addRows = (rows: BlogPostCardRow[] | null | undefined) => {
        for (const row of rows ?? []) {
          if (row.id === postId) continue;
          const existing = scored.get(row.id);
          if (existing) existing.score += 1;
          else scored.set(row.id, { row, score: 1 });
        }
      };

      const queries: Promise<void>[] = [];

      if (categorySlug) {
        queries.push(
          (async () => {
            const { data } = await supabase
              .from("blog_posts")
              .select(`${BLOG_POST_CARD_COLUMNS}, blog_categories!inner(slug)`)
              .eq("status", "published")
              .eq("blog_categories.slug", categorySlug)
              .neq("id", postId)
              .order("published_at", { ascending: false })
              .limit(CANDIDATE_CAP);
            addRows(data);
          })(),
        );
      }

      if (tagSlugs.length > 0) {
        queries.push(
          (async () => {
            const { data } = await supabase
              .from("blog_posts")
              .select(`${BLOG_POST_CARD_COLUMNS}, blog_post_tags!inner(blog_tags!inner(slug))`)
              .eq("status", "published")
              .in("blog_post_tags.blog_tags.slug", tagSlugs)
              .neq("id", postId)
              .order("published_at", { ascending: false })
              .limit(CANDIDATE_CAP);
            addRows(data);
          })(),
        );
      }

      if (locationIds.length > 0) {
        queries.push(
          (async () => {
            const { data } = await supabase
              .from("blog_posts")
              .select(`${BLOG_POST_CARD_COLUMNS}, blog_post_locations!inner(location_id)`)
              .eq("status", "published")
              .in("blog_post_locations.location_id", locationIds)
              .neq("id", postId)
              .order("published_at", { ascending: false })
              .limit(CANDIDATE_CAP);
            addRows(data);
          })(),
        );
      }

      await Promise.all(queries);

      return [...scored.values()]
        .sort((a, b) => b.score - a.score || (b.row.published_at ?? "").localeCompare(a.row.published_at ?? ""))
        .slice(0, limit)
        .map(({ row }) => toBlogPostCard(row));
    },
    ["getRelatedBlogPosts"],
    { revalidate: PUBLIC_REVALIDATE_SECONDS },
  ),
);

/** Resolves locationLink content-block ids to published-only location
 * cards, in one batched query — never queried one-by-one per block. Ids
 * that don't exist, or whose location is unpublished, are simply absent
 * from the result (RLS on `locations` already restricts to `is_published
 * = true`; the explicit filter here documents that same intent). */
export const getPublicLocationLinksByIds = cache(
  unstable_cache(
    async (ids: string[]): Promise<{ id: string; name: string; slug: string }[]> => {
      if (ids.length === 0) return [];
      const supabase = createPublicClient();
      const { data } = await supabase
        .from("locations")
        .select("id, name, slug")
        .eq("is_published", true)
        .in("id", ids);
      return data ?? [];
    },
    ["getPublicLocationLinksByIds"],
    { revalidate: PUBLIC_REVALIDATE_SECONDS },
  ),
);
// ---------------------------------------------------------------------------
// Hybrid editorial content (State / State + Category pages)
// ---------------------------------------------------------------------------

/** One published location's information-table fields, keyed by column code —
 * resolved in a single batched query for every locationInfoTable /
 * locationLink block on an editorial page. Only EXTRA_DETAIL_COLUMNS (the
 * approved ExtraDetails set) is fetched; no other location column is
 * exposed, and unpublished/deleted locations are absent entirely (RLS +
 * explicit is_published filter). */
export type PublicLocationInfoEntry = {
  id: string;
  name: string;
  slug: string;
  details: Record<string, string | null>;
};

export const getPublicLocationInfoByIds = cache(
  unstable_cache(
    async (ids: string[]): Promise<PublicLocationInfoEntry[]> => {
      if (ids.length === 0) return [];
      const supabase = createPublicClient();
      const { data } = await supabase
        .from("locations")
        .select(`id, name, slug, ${EXTRA_DETAIL_COLUMNS}`)
        .eq("is_published", true)
        .in("id", ids);

      return (data ?? []).map((location) => {
        const details: Record<string, string | null> = {};
        const locationRecord = location as unknown as Record<string, unknown>;
        for (const code of EXTRA_DETAIL_COLUMNS.split(",").map((c) => c.trim())) {
          const value = locationRecord[code];
          details[code] = typeof value === "string" ? value : null;
        }
        return { id: location.id, name: location.name, slug: location.slug, details };
      });
    },
    ["getPublicLocationInfoByIds"],
    { revalidate: PUBLIC_REVALIDATE_SECONDS },
  ),
);

/** Per-block fail-closed validation for location_editorial.content is
 * provided by parseEditorialBlocks (content-blocks.ts) — see the function
 * docstring there. */

/** Published editorial content for a State page (categoryId null) or a
 * State + Category page. Returns an empty array when none exists, is a
 * draft, or is malformed — never exposes drafts through public reads (RLS
 * already hides them; the explicit status filter documents that intent). */
export const getLocationEditorial = cache(
  unstable_cache(
    async (stateId: string, categoryId: string | null): Promise<EditorialBlock[]> => {
      const supabase = createPublicClient();
      let query = supabase
        .from("location_editorial")
        .select("content")
        .eq("state_id", stateId)
        .eq("scope", categoryId ? "state_category" : "state")
        .eq("status", "published");

      if (categoryId) query = query.eq("category_id", categoryId);
      else query = query.is("category_id", null);

      const { data } = await query.maybeSingle();
      if (!data) return [];
      return parseEditorialBlocks(data.content);
    },
    ["getLocationEditorial"],
    { revalidate: PUBLIC_REVALIDATE_SECONDS, tags: ["location-editorial"] },
  ),
);

/** Admin location-information-table configuration from the single-row
 * site_settings table. Malformed JSON fails closed to canonical defaults
 * (empty config = all fields, canonical order, canonical labels). */
function parseLocationInfoTableConfig(value: unknown): LocationInfoTableConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const config = value as Record<string, unknown>;
  const result: LocationInfoTableConfig = {};
  const validCodes = new Set(LOCATION_INFO_FIELDS.map((field) => field.code));

  if (config.enabled !== undefined) {
    if (!Array.isArray(config.enabled) || !config.enabled.every((c) => typeof c === "string")) return {};
    result.enabled = config.enabled.filter((code): code is string => validCodes.has(code));
  }
  if (config.order !== undefined) {
    if (!Array.isArray(config.order) || !config.order.every((c) => typeof c === "string")) return {};
    result.order = config.order.filter((code): code is string => validCodes.has(code));
  }
  if (config.labels !== undefined) {
    if (typeof config.labels !== "object" || config.labels === null || Array.isArray(config.labels)) return {};
    const labels: Record<string, string> = {};
    for (const [key, value] of Object.entries(config.labels as Record<string, unknown>)) {
      if (validCodes.has(key) && typeof value === "string" && value.length <= 200) labels[key] = value;
    }
    result.labels = labels;
  }
  return result;
}

export const getLocationInfoTableConfig = unstable_cache(
  async (): Promise<LocationInfoTableConfig> => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("site_settings")
      .select("location_info_table_config")
      .eq("id", true)
      .maybeSingle();
    return parseLocationInfoTableConfig(data?.location_info_table_config);
  },
  ["getLocationInfoTableConfig"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS, tags: ["location-info-table-config"] },
);
// ---------------------------------------------------------------------------
// Footer social media links (Admin → Settings → Social Media)
// ---------------------------------------------------------------------------

/** Fixed allowlist of social platforms the admin can configure. The set is
 * intentionally closed: the DB only stores these five columns, the Settings
 * server action accepts exactly these fields, and the footer maps each
 * platform to a hardcoded icon — arbitrary platform values can never reach
 * the public UI. */
export type SocialPlatform = "instagram" | "facebook" | "youtube" | "pinterest" | "linkedin";

export type SocialLink = {
  platform: SocialPlatform;
  url: string;
};

/** Social media profile links configured by the admin (Admin → Settings →
 * Social Media), for the public site footer. Reads ONLY the five footer
 * platform columns from the single-row site_settings table through the
 * anonymous RLS-bound client, drops empty/unset values, and returns a
 * fixed-order array of non-empty { platform, url } entries — no other
 * site_settings field is ever read or exposed. Cached like every other
 * public data accessor (PUBLIC_REVALIDATE_SECONDS), so footer pages stay
 * eligible for static caching. */
export const getSocialMediaLinks = unstable_cache(
  async (): Promise<SocialLink[]> => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("site_settings")
      .select("instagram_url, facebook_url, youtube_url, pinterest_url, linkedin_url")
      .eq("id", true)
      .maybeSingle();

    if (!data) return [];

    const links: SocialLink[] = [];
    const push = (platform: SocialPlatform, url: unknown) => {
      if (typeof url === "string" && url.trim().length > 0) {
        links.push({ platform, url });
      }
    };
    push("instagram", data.instagram_url);
    push("facebook", data.facebook_url);
    push("youtube", data.youtube_url);
    push("pinterest", data.pinterest_url);
    push("linkedin", data.linkedin_url);
    return links;
  },
  ["getSocialMediaLinks"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
);
