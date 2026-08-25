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
      "id, name, slug, pricing_type, price, categories(name, slug, sort_order), states(name, slug), cities(name, slug), location_images(image_url, sort_order)",
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
    };
  });
}
