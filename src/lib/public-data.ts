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
    near?: { latitude: number; longitude: number };
  }): Promise<PublicLocationCard[]> => {
    const supabase = createPublicClient();

    let query = supabase
      .from("locations")
      .select(
        "id, name, card_name, slug, pricing_type, price, latitude, longitude, updated_at, categories(name, slug, sort_order), countries(name, slug), states(name, slug), cities(name, slug), location_images(image_url, sort_order)",
      )
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    if (filters?.categoryId) query = query.eq("category_id", filters.categoryId);
    if (filters?.countryId) query = query.eq("country_id", filters.countryId);
    if (filters?.stateId) query = query.eq("state_id", filters.stateId);
    if (filters?.cityId) query = query.eq("city_id", filters.cityId);
    if (filters?.pricingType) query = query.eq("pricing_type", filters.pricingType);

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
  city: GeoRef | null;
  images: string[];
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
      `id, name, slug, description, pricing_type, price, price_note, action_type, action_value, meta_title, meta_description, map_url, latitude, longitude, youtube_url, ${EXTRA_DETAIL_COLUMNS}, categories(name, slug), countries(name, slug), states(name, slug), cities(name, slug), location_images(image_url, sort_order)`,
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
    city: Array.isArray(data.cities) ? (data.cities[0] ?? null) : data.cities,
    images: [...(data.location_images ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((img) => img.image_url),
  };
    },
    ["getPublishedLocationBySlug"],
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
  city: GeoRef | null;
  images: string[];
  pricingOptions: { label: string; price: number }[];
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
      `id, name, slug, description, action_type, action_value, meta_title, meta_description, map_url, latitude, longitude, youtube_url, ${EXTRA_DETAIL_COLUMNS}, countries(name, slug), states(name, slug), cities(name, slug), studio_images(image_url, sort_order), studio_pricing_options(label, price, sort_order)`,
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
    city: Array.isArray(data.cities) ? (data.cities[0] ?? null) : data.cities,
    images: [...(data.studio_images ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((img) => img.image_url),
    pricingOptions: [...(data.studio_pricing_options ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((o) => ({ label: o.label, price: o.price })),
  };
    },
    ["getPublishedStudioBySlug"],
    { revalidate: PUBLIC_REVALIDATE_SECONDS },
  ),
);
