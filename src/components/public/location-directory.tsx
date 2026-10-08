"use client";

import { useSearchParams } from "next/navigation";
import { HomeFilter } from "@/components/public/home-filter";
import { filterLocations, type PublicLocationCard } from "@/lib/location-filter";
import {
  CategoryExploreByState,
  CityBrowse,
  CountryBrowse,
  FlatBrowse,
  StateBrowse,
} from "@/components/public/location-browse-views";

type Option = { id: string; name: string; slug: string };
type CityOption = Option & { state_id: string };

export type LocationDirectoryMode =
  | "country"
  | "state"
  | "city"
  | "stateCategory"
  | "cityCategory"
  | "category";

type Fixed = {
  state?: { name: string; slug: string };
  city?: { name: string; slug: string };
  category?: { name: string; slug: string };
};

type RawQuery = {
  q: string | null;
  state: string | null;
  city: string | null;
  category: string | null;
  pricing: string | null;
  drone: string | null;
  page: string | null;
};

function pricingFrom(value: string | null): "free" | "paid" | "unknown" | undefined {
  return value === "free" || value === "paid" || value === "unknown" ? value : undefined;
}

function droneFrom(
  value: string | null,
): "allowed" | "allowed_with_permission" | "not_allowed" | undefined {
  return value === "allowed" || value === "allowed_with_permission" || value === "not_allowed"
    ? value
    : undefined;
}

/** Resolves the raw query string into the filter state used by both the
 * filter bar and the results — mirrors the old per-mode server resolution
 * (including the fixed-page override semantics for city+category and
 * state+category pages). */
function resolveDirectoryQuery(
  mode: LocationDirectoryMode,
  raw: RawQuery,
  states: Option[],
  cities: CityOption[],
  categories: Option[],
  fixed: Fixed,
) {
  const search = raw.q?.trim() || undefined;
  const pricing = pricingFrom(raw.pricing);
  const drone = droneFrom(raw.drone);

  let selectedStateSlug: string | undefined;
  let selectedCitySlug: string | undefined;
  let selectedCategorySlug: string | undefined;
  let hasStateFilter = false;
  let hasCityFilter = false;
  let hasCategoryFilter = false;

  switch (mode) {
    case "country":
      selectedStateSlug = states.find((s) => s.slug === raw.state)?.slug;
      selectedCitySlug = cities.find((c) => c.slug === raw.city)?.slug;
      selectedCategorySlug = categories.find((c) => c.slug === raw.category)?.slug;
      hasStateFilter = Boolean(selectedStateSlug);
      hasCityFilter = Boolean(selectedCitySlug);
      hasCategoryFilter = Boolean(selectedCategorySlug);
      break;
    case "state":
      selectedCitySlug = cities.find((c) => c.slug === raw.city)?.slug;
      selectedCategorySlug = categories.find((c) => c.slug === raw.category)?.slug;
      hasCityFilter = Boolean(selectedCitySlug);
      hasCategoryFilter = Boolean(selectedCategorySlug);
      break;
    case "city":
      selectedCategorySlug = categories.find((c) => c.slug === raw.category)?.slug;
      hasCategoryFilter = Boolean(selectedCategorySlug);
      break;
    case "stateCategory":
      selectedCitySlug = cities.find((c) => c.slug === raw.city)?.slug;
      selectedCategorySlug = categories.find((c) => c.slug === raw.category)?.slug ?? fixed.category?.slug;
      hasCityFilter = Boolean(selectedCitySlug);
      hasCategoryFilter = Boolean(raw.category && selectedCategorySlug !== fixed.category?.slug);
      break;
    case "cityCategory":
      selectedCitySlug = cities.find((c) => c.slug === raw.city)?.slug ?? fixed.city?.slug;
      selectedCategorySlug = categories.find((c) => c.slug === raw.category)?.slug ?? fixed.category?.slug;
      hasCityFilter = Boolean(raw.city && selectedCitySlug !== fixed.city?.slug);
      hasCategoryFilter = Boolean(raw.category && selectedCategorySlug !== fixed.category?.slug);
      break;
    case "category":
      selectedStateSlug = states.find((s) => s.slug === raw.state)?.slug;
      selectedCitySlug = cities.find((c) => c.slug === raw.city)?.slug;
      hasStateFilter = Boolean(selectedStateSlug);
      hasCityFilter = Boolean(selectedCitySlug);
      break;
  }

  const hasFilters =
    hasStateFilter || hasCityFilter || hasCategoryFilter || Boolean(pricing) || Boolean(drone) || Boolean(search);

  const hideState = mode === "state" || mode === "city" || mode === "stateCategory" || mode === "cityCategory";
  const hideCity = mode === "city";
  const hideCategory = mode === "category";

  const linkQuery: Record<string, string | undefined> = {};
  if (raw.q) linkQuery.q = raw.q;
  if ((mode === "country" || mode === "category") && raw.state) linkQuery.state = raw.state;
  if (mode !== "city" && raw.city) linkQuery.city = raw.city;
  if (mode !== "category" && raw.category) linkQuery.category = raw.category;
  if (raw.pricing) linkQuery.pricing = raw.pricing;
  if (raw.drone) linkQuery.drone = raw.drone;

  const initial = {
    q: raw.q ?? undefined,
    state: hideState ? fixed.state?.slug : (raw.state ?? undefined),
    city: hideCity
      ? fixed.city?.slug
      : mode === "cityCategory"
        ? (raw.city ?? fixed.city?.slug)
        : (raw.city ?? undefined),
    category: hideCategory
      ? undefined
      : mode === "stateCategory" || mode === "cityCategory"
        ? (raw.category ?? fixed.category?.slug)
        : (raw.category ?? undefined),
    pricing: raw.pricing ?? undefined,
    drone: raw.drone ?? undefined,
  };

  return {
    search,
    pricing,
    drone,
    selectedStateSlug,
    selectedCitySlug,
    selectedCategorySlug,
    hasFilters,
    hideState,
    hideCity,
    hideCategory,
    initial,
    linkQuery,
  };
}

type SharedProps = {
  mode: LocationDirectoryMode;
  states: Option[];
  cities: CityOption[];
  categories: Option[];
  fixedState?: { name: string; slug: string };
  fixedCity?: { name: string; slug: string };
  fixedCategory?: { name: string; slug: string };
};

/** Filter bar for the directory pages. Reads the query string on the client
 * so the route itself stays static; the server page renders a HomeFilter
 * with empty `initial` as the Suspense fallback. */
export function DirectoryFilter({
  mode,
  states,
  cities,
  categories,
  basePath,
  fixedState,
  fixedCity,
  fixedCategory,
}: SharedProps & { basePath: string }) {
  const searchParams = useSearchParams();
  const resolved = resolveDirectoryQuery(
    mode,
    {
      q: searchParams.get("q"),
      state: searchParams.get("state"),
      city: searchParams.get("city"),
      category: searchParams.get("category"),
      pricing: searchParams.get("pricing"),
      drone: searchParams.get("drone"),
      page: searchParams.get("page"),
    },
    states,
    cities,
    categories,
    { state: fixedState, city: fixedCity, category: fixedCategory },
  );

  return (
    <HomeFilter
      states={states}
      cities={cities}
      categories={categories}
      hideState={resolved.hideState}
      hideCity={resolved.hideCity}
      hideCategory={resolved.hideCategory}
      basePath={basePath}
      initial={resolved.initial}
    />
  );
}

/** Results area for the directory pages: the canonical browse view when no
 * filters are active, or the filtered/paged grid when they are. */
export function DirectoryResults({
  mode,
  locations,
  states,
  cities,
  categories,
  basePath,
  fixedState,
  fixedCity,
  fixedCategory,
  country,
  countrySlug,
  heading,
}: SharedProps & {
  locations: PublicLocationCard[];
  basePath: string;
  country?: { name: string; slug: string };
  countrySlug?: string;
  heading?: string;
}) {
  const searchParams = useSearchParams();
  const raw = {
    q: searchParams.get("q"),
    state: searchParams.get("state"),
    city: searchParams.get("city"),
    category: searchParams.get("category"),
    pricing: searchParams.get("pricing"),
    drone: searchParams.get("drone"),
    page: searchParams.get("page"),
  };
  const resolved = resolveDirectoryQuery(
    mode,
    raw,
    states,
    cities,
    categories,
    { state: fixedState, city: fixedCity, category: fixedCategory },
  );
  const pageParam = raw.page ?? undefined;

  const filtered = filterLocations(locations, {
    stateSlug: resolved.selectedStateSlug,
    citySlug: resolved.selectedCitySlug,
    categorySlug: resolved.selectedCategorySlug,
    pricing: resolved.pricing,
    drone: resolved.drone,
    search: resolved.search,
  });

  if (resolved.hasFilters) {
    const total = filtered.length;
    let filteredHeading: string;
    if (mode === "stateCategory" || mode === "cityCategory") {
      const categoryName =
        categories.find((c) => c.slug === resolved.selectedCategorySlug)?.name ?? fixedCategory?.name ?? "";
      const areaName =
        mode === "cityCategory"
          ? cities.find((c) => c.slug === resolved.selectedCitySlug)?.name ?? fixedCity?.name ?? ""
          : cities.find((c) => c.slug === resolved.selectedCitySlug)?.name ?? fixedState?.name ?? "";
      filteredHeading = `${total} ${categoryName} Pre-Wedding Location${total === 1 ? "" : "s"} in ${areaName}`;
    } else {
      filteredHeading = `${total} location${total === 1 ? "" : "s"} found`;
    }
    const emptyMessage =
      mode === "category"
        ? `No published ${(fixedCategory?.name ?? "").toLowerCase()} locations match these filters yet. Try a different combination.`
        : undefined;

    return (
      <FlatBrowse
        heading={filteredHeading}
        locations={filtered}
        page={pageParam}
        basePath={basePath}
        query={resolved.linkQuery}
        emptyMessage={emptyMessage}
      />
    );
  }

  switch (mode) {
    case "country":
      return <CountryBrowse country={country!} locations={locations} />;
    case "state":
      return (
        <StateBrowse
          countrySlug={countrySlug!}
          state={fixedState!}
          locations={locations}
          page={pageParam}
          basePath={basePath}
          query={resolved.linkQuery}
        />
      );
    case "city":
      return (
        <CityBrowse
          countrySlug={countrySlug!}
          state={fixedState!}
          city={fixedCity!}
          locations={locations}
          page={pageParam}
          basePath={basePath}
          query={resolved.linkQuery}
        />
      );
    default:
      return (
        <>
          <FlatBrowse
            heading={heading ?? ""}
            locations={locations}
            page={pageParam}
            basePath={basePath}
            query={resolved.linkQuery}
          />
          {mode === "category" && (
            <CategoryExploreByState category={fixedCategory!} locations={locations} />
          )}
        </>
      );
  }
}
