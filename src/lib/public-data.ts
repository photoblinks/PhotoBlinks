import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { haversineDistanceKm } from "@/lib/geo";

export type PricingType = "free" | "paid" | "unknown";

/** Optional call-to-action button shown below "Go to Location" — shared by
 * locations and studios. `action_value` holds a URL for book_now/website or
 * a phone number for call_now. */
export type ActionType = "book_now" | "website" | "call_now";

export type GeoRef = { name: string; slug: string };

export type PublicLocationCard = {
  id: string;
  name: string;
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

export async function getSiteSettings() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("site_banner_images")
    .select("image_url")
    .order("sort_order");
  return { bannerImages: (data ?? []).map((row) => row.image_url) };
}

export async function getActiveCountries() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("countries")
    .select("id, name, slug, code")
    .eq("is_active", true)
    .order("name");
  return data ?? [];
}

export async function getActiveStates() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("states")
    .select("id, name, slug, country_id, countries(name, slug)")
    .eq("is_active", true)
    .order("name");
  return (data ?? []).map((state) => ({
    id: state.id,
    name: state.name,
    slug: state.slug,
    country_id: state.country_id,
    country: Array.isArray(state.countries) ? (state.countries[0] ?? null) : state.countries,
  }));
}

export async function getActiveCities() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cities")
    .select("id, name, slug, state_id")
    .eq("is_active", true)
    .order("name");
  return data ?? [];
}

export async function getActiveCategories() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("categories")
    .select("id, name, slug, sort_order")
    .eq("is_active", true)
    .order("sort_order");
  return data ?? [];
}

/** For each category, the real /locations/{state}/{city}/{category} SEO
 * landing page for whichever city has the most published locations in
 * that category — so site-wide nav (e.g. the footer) can link to an
 * actual landing page instead of a homepage filter query. Categories with
 * no published locations anywhere are omitted, not linked to a fake URL. */
export const getCategoryLandingPaths = cache(async function getCategoryLandingPaths() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("locations")
    .select("categories(slug), countries(slug), states(slug), cities(slug)")
    .eq("is_published", true);

  type Best = { countrySlug: string; stateSlug: string; citySlug: string; count: number };
  const cityCounts = new Map<string, Best>();
  for (const location of data ?? []) {
    const category = Array.isArray(location.categories) ? location.categories[0] : location.categories;
    const country = Array.isArray(location.countries) ? location.countries[0] : location.countries;
    const state = Array.isArray(location.states) ? location.states[0] : location.states;
    const city = Array.isArray(location.cities) ? location.cities[0] : location.cities;
    if (!category || !country || !state || !city) continue;

    const key = `${category.slug}::${country.slug}/${state.slug}/${city.slug}`;
    const existing = cityCounts.get(key);
    if (existing) existing.count += 1;
    else {
      cityCounts.set(key, {
        countrySlug: country.slug,
        stateSlug: state.slug,
        citySlug: city.slug,
        count: 1,
      });
    }
  }

  const bestPerCategory = new Map<string, Best>();
  for (const [key, value] of cityCounts) {
    const categorySlug = key.split("::")[0];
    const current = bestPerCategory.get(categorySlug);
    if (!current || value.count > current.count) bestPerCategory.set(categorySlug, value);
  }

  const paths = new Map<string, string>();
  for (const [categorySlug, best] of bestPerCategory) {
    paths.set(
      categorySlug,
      `/locations/${best.countrySlug}/${best.stateSlug}/${best.citySlug}/${categorySlug}`,
    );
  }
  return paths;
});

/** All published locations matching the given filters, newest first. Each
 * embeds its resolved category/state/city and primary (first) image. */
export async function getPublishedLocations(filters?: {
  categoryId?: string;
  countryId?: string;
  stateId?: string;
  cityId?: string;
  pricingType?: PricingType;
  /** When provided, results are sorted nearest-first instead of newest-first. */
  near?: { latitude: number; longitude: number };
}): Promise<PublicLocationCard[]> {
  const supabase = await createClient();

  let query = supabase
    .from("locations")
    .select(
      "id, name, slug, pricing_type, price, latitude, longitude, updated_at, categories(name, slug, sort_order), countries(name, slug), states(name, slug), cities(name, slug), location_images(image_url, sort_order)",
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
}

export type PublicStudioCard = {
  id: string;
  name: string;
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
export async function getPublishedStudios(filters?: {
  countryId?: string;
  stateId?: string;
  cityId?: string;
}): Promise<PublicStudioCard[]> {
  const supabase = await createClient();

  let query = supabase
    .from("studios")
    .select(
      "id, name, slug, updated_at, countries(name, slug), states(name, slug), cities(name, slug), studio_images(image_url, sort_order), studio_pricing_options(price)",
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
      slug: studio.slug,
      country: Array.isArray(studio.countries) ? (studio.countries[0] ?? null) : studio.countries,
      state: Array.isArray(studio.states) ? (studio.states[0] ?? null) : studio.states,
      city: Array.isArray(studio.cities) ? (studio.cities[0] ?? null) : studio.cities,
      primaryImageUrl,
      fromPrice: prices.length > 0 ? Math.min(...prices) : null,
      updatedAt: studio.updated_at,
    };
  });
}

/** Optional detail fields shared by locations and studios — set by the
 * admin, shown on the public page only when present. */
export type ExtraDetails = {
  drone_status: "allowed" | "restricted" | "conditional" | null;
  entry_fee: string | null;
  best_season: string | null;
  best_time: string | null;
  crowd: string | null;
  access: string | null;
  privacy: string | null;
};

const EXTRA_DETAIL_COLUMNS = "drone_status, entry_fee, best_season, best_time, crowd, access, privacy";

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
export const getPublishedLocationBySlug = cache(async function getPublishedLocationBySlug(
  slug: string,
): Promise<PublicLocationDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("locations")
    .select(
      `id, name, slug, description, pricing_type, price, price_note, action_type, action_value, map_url, latitude, longitude, youtube_url, ${EXTRA_DETAIL_COLUMNS}, categories(name, slug), countries(name, slug), states(name, slug), cities(name, slug), location_images(image_url, sort_order)`,
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
    map_url: data.map_url,
    latitude: data.latitude,
    longitude: data.longitude,
    youtube_url: data.youtube_url,
    drone_status: data.drone_status,
    entry_fee: data.entry_fee,
    best_season: data.best_season,
    best_time: data.best_time,
    crowd: data.crowd,
    access: data.access,
    privacy: data.privacy,
    category: Array.isArray(data.categories) ? (data.categories[0] ?? null) : data.categories,
    country: Array.isArray(data.countries) ? (data.countries[0] ?? null) : data.countries,
    state: Array.isArray(data.states) ? (data.states[0] ?? null) : data.states,
    city: Array.isArray(data.cities) ? (data.cities[0] ?? null) : data.cities,
    images: [...(data.location_images ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((img) => img.image_url),
  };
});

export type PublicStudioDetail = ExtraDetails & {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  action_type: ActionType | null;
  action_value: string | null;
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
export const getPublishedStudioBySlug = cache(async function getPublishedStudioBySlug(
  slug: string,
): Promise<PublicStudioDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("studios")
    .select(
      `id, name, slug, description, action_type, action_value, map_url, latitude, longitude, youtube_url, ${EXTRA_DETAIL_COLUMNS}, countries(name, slug), states(name, slug), cities(name, slug), studio_images(image_url, sort_order), studio_pricing_options(label, price, sort_order)`,
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
    map_url: data.map_url,
    latitude: data.latitude,
    longitude: data.longitude,
    youtube_url: data.youtube_url,
    drone_status: data.drone_status,
    entry_fee: data.entry_fee,
    best_season: data.best_season,
    best_time: data.best_time,
    crowd: data.crowd,
    access: data.access,
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
});
