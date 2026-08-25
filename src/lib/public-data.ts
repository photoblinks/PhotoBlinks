import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type PricingType = "free" | "paid" | "unknown";

export type PublicLocationCard = {
  id: string;
  name: string;
  slug: string;
  pricing_type: PricingType;
  price: number | null;
  category: { name: string; slug: string; sort_order: number } | null;
  state: { name: string; slug: string } | null;
  city: { name: string; slug: string } | null;
  primaryImageUrl: string | null;
  latitude: number | null;
  longitude: number | null;
};

export async function getActiveStates() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("states")
    .select("id, name, slug")
    .eq("is_active", true)
    .order("name");
  return data ?? [];
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

/** All published locations matching the given filters, newest first. Each
 * embeds its resolved category/state/city and primary (first) image. */
export async function getPublishedLocations(filters?: {
  categoryId?: string;
  stateId?: string;
  cityId?: string;
  pricingType?: PricingType;
}): Promise<PublicLocationCard[]> {
  const supabase = await createClient();

  let query = supabase
    .from("locations")
    .select(
      "id, name, slug, pricing_type, price, latitude, longitude, categories(name, slug, sort_order), states(name, slug), cities(name, slug), location_images(image_url, sort_order)",
    )
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  if (filters?.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters?.stateId) query = query.eq("state_id", filters.stateId);
  if (filters?.cityId) query = query.eq("city_id", filters.cityId);
  if (filters?.pricingType) query = query.eq("pricing_type", filters.pricingType);

  const { data } = await query;

  return (data ?? []).map((location) => {
    const primaryImageUrl =
      [...(location.location_images ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0]
        ?.image_url ?? null;

    return {
      id: location.id,
      name: location.name,
      slug: location.slug,
      pricing_type: location.pricing_type,
      price: location.price,
      category: Array.isArray(location.categories) ? (location.categories[0] ?? null) : location.categories,
      state: Array.isArray(location.states) ? (location.states[0] ?? null) : location.states,
      city: Array.isArray(location.cities) ? (location.cities[0] ?? null) : location.cities,
      primaryImageUrl,
      latitude: location.latitude,
      longitude: location.longitude,
    };
  });
}

export type PublicLocationDetail = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  pricing_type: PricingType;
  price: number | null;
  country: string;
  map_url: string | null;
  latitude: number | null;
  longitude: number | null;
  youtube_url: string | null;
  category: { name: string; slug: string } | null;
  state: { name: string; slug: string } | null;
  city: { name: string; slug: string } | null;
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
      "id, name, slug, description, pricing_type, price, country, map_url, latitude, longitude, youtube_url, categories(name, slug), states(name, slug), cities(name, slug), location_images(image_url, sort_order)",
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
    country: data.country,
    map_url: data.map_url,
    latitude: data.latitude,
    longitude: data.longitude,
    youtube_url: data.youtube_url,
    category: Array.isArray(data.categories) ? (data.categories[0] ?? null) : data.categories,
    state: Array.isArray(data.states) ? (data.states[0] ?? null) : data.states,
    city: Array.isArray(data.cities) ? (data.cities[0] ?? null) : data.cities,
    images: [...(data.location_images ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((img) => img.image_url),
  };
});

export type PublicStudioDetail = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  country: string;
  map_url: string | null;
  latitude: number | null;
  longitude: number | null;
  youtube_url: string | null;
  state: { name: string; slug: string } | null;
  city: { name: string; slug: string } | null;
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
      "id, name, slug, description, country, map_url, latitude, longitude, youtube_url, states(name, slug), cities(name, slug), studio_images(image_url, sort_order), studio_pricing_options(label, price, sort_order)",
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
    country: data.country,
    map_url: data.map_url,
    latitude: data.latitude,
    longitude: data.longitude,
    youtube_url: data.youtube_url,
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
