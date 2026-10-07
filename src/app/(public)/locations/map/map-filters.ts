import type { getPublishedLocations } from "@/lib/public-data";

export type MapFilterParams = {
  q?: string;
  state?: string;
  city?: string;
  category?: string;
  pricing?: string;
  drone?: string;
  lat?: string;
  lng?: string;
};

type Slugged = { id: string; slug: string };

/** Turns the map's query-string filters into getPublishedLocations filters.
 * Shared by the page (initial render) and the viewport-reload server action
 * so both always apply identical filter semantics. */
export function resolveMapFilters(
  params: MapFilterParams,
  lists: { states: Slugged[]; cities: Slugged[]; categories: Slugged[] },
): NonNullable<Parameters<typeof getPublishedLocations>[0]> {
  const pricingType =
    params.pricing === "free" || params.pricing === "paid" || params.pricing === "unknown"
      ? params.pricing
      : undefined;
  const droneStatus =
    params.drone === "allowed" || params.drone === "allowed_with_permission" || params.drone === "not_allowed"
      ? params.drone
      : undefined;
  const near =
    params.lat && params.lng
      ? { latitude: Number(params.lat), longitude: Number(params.lng) }
      : undefined;

  return {
    categoryId: lists.categories.find((c) => c.slug === params.category)?.id,
    stateId: lists.states.find((s) => s.slug === params.state)?.id,
    cityId: lists.cities.find((c) => c.slug === params.city)?.id,
    pricingType,
    droneStatus,
    near: near && Number.isFinite(near.latitude) && Number.isFinite(near.longitude) ? near : undefined,
    search: params.q?.trim() || undefined,
  };
}
