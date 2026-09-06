import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { haversineDistanceKm } from "@/lib/geo";

// This module is the ONLY place public pages read data from — it never
// imports the cookie-based admin client (src/lib/supabase/server.ts), so
// nothing here forces a route into dynamic rendering. Every exported
// data-fetching function below is wrapped in `unstable_cache` so its
// result is reused across requests/visitors for this long, instead of
// hitting Supabase on every request. A published/unpublished change made
// in the admin panel becomes visible on the public site within this
// window (or immediately, on routes that can't be statically cached at
// all because they read searchParams, e.g. the homepage and map filters).
const PUBLIC_REVALIDATE_SECONDS = 60;

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
  pre_wedding_shoot: string | null;
  prior_booking: string | null;
  camera_charges: string | null;
  drone_status: "allowed" | "allowed_with_permission" | "restricted" | "prohibited" | null;
  // Pricing & Timing
  entry_fee: string | null;
  best_season: string | null;
  best_time: string | null;
  // Amenities
  changing_rooms: AvailabilityStatus | null;
  parking_facility: AvailabilityStatus | null;
  facilities: string | null;
  // Environment
  access: string | null;
  crowd: string | null;
  privacy: string | null;
};

const EXTRA_DETAIL_COLUMNS =
  "pre_wedding_shoot, prior_booking, camera_charges, drone_status, entry_fee, best_season, best_time, changing_rooms, parking_facility, facilities, access, crowd, privacy";

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
      `id, name, card_name, slug, description, pricing_type, price, price_note, action_type, action_value, meta_title, meta_description, map_url, latitude, longitude, youtube_url, state_id, ${EXTRA_DETAIL_COLUMNS}, categories(name, slug), countries(name, slug), states(name, slug), cities(name, slug), location_images(image_url, sort_order), location_faqs(question, answer, sort_order)`,
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
    prior_booking: data.prior_booking,
    camera_charges: data.camera_charges,
    drone_status: data.drone_status,
    entry_fee: data.entry_fee,
    best_season: data.best_season,
    best_time: data.best_time,
    changing_rooms: data.changing_rooms,
    parking_facility: data.parking_facility,
    facilities: data.facilities,
    access: data.access,
    crowd: data.crowd,
    privacy: data.privacy,
    category: Array.isArray(data.categories) ? (data.categories[0] ?? null) : data.categories,
    country: Array.isArray(data.countries) ? (data.countries[0] ?? null) : data.countries,
    state: Array.isArray(data.states) ? (data.states[0] ?? null) : data.states,
    state_id: data.state_id,
    city: Array.isArray(data.cities) ? (data.cities[0] ?? null) : data.cities,
    images: [...(data.location_images ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((img) => img.image_url),
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
      `id, name, slug, description, action_type, action_value, meta_title, meta_description, map_url, latitude, longitude, youtube_url, state_id, ${EXTRA_DETAIL_COLUMNS}, countries(name, slug), states(name, slug), cities(name, slug), studio_images(image_url, sort_order), studio_pricing_options(label, price, sort_order), studio_faqs(question, answer, sort_order)`,
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
    prior_booking: data.prior_booking,
    camera_charges: data.camera_charges,
    drone_status: data.drone_status,
    entry_fee: data.entry_fee,
    best_season: data.best_season,
    best_time: data.best_time,
    changing_rooms: data.changing_rooms,
    parking_facility: data.parking_facility,
    facilities: data.facilities,
    access: data.access,
    crowd: data.crowd,
    privacy: data.privacy,
    country: Array.isArray(data.countries) ? (data.countries[0] ?? null) : data.countries,
    state: Array.isArray(data.states) ? (data.states[0] ?? null) : data.states,
    state_id: data.state_id,
    city: Array.isArray(data.cities) ? (data.cities[0] ?? null) : data.cities,
    images: [...(data.studio_images ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((img) => img.image_url),
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
