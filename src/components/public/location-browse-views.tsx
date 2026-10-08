import Link from "next/link";
import { LocationCard } from "@/components/public/location-card";
import { ListingPagination } from "@/components/public/listing-pagination";
import { paginateListing } from "@/lib/listing-pagination";
import {
  groupLocationsByCategory,
  type PublicLocationCard,
} from "@/lib/location-filter";
import { extractCategoryNames } from "@/lib/seo-templates";

/** Shared browse/render views for the location directory pages. Pure
 * presentational components (no "use client") so they can be rendered both
 * by the static server page (as the Suspense fallback / SEO content) and by
 * the client-side directory component (for filtered/paged query variants).
 * `query` is the full parsed query string record, passed through to
 * ListingPagination so pagination links preserve any active filters. */

type QueryRecord = Record<string, string | undefined>;

/** Country → list of states with published-location counts (not paginated —
 * matches the original /locations/[country] browse view). */
export function CountryBrowse({
  country,
  locations,
}: {
  country: { name: string; slug: string };
  locations: PublicLocationCard[];
}) {
  const stateCounts = new Map<string, { name: string; slug: string; count: number }>();
  for (const location of locations) {
    if (!location.state) continue;
    const existing = stateCounts.get(location.state.slug);
    if (existing) existing.count += 1;
    else stateCounts.set(location.state.slug, { ...location.state, count: 1 });
  }
  const states = [...stateCounts.values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <p className="mb-2 max-w-2xl text-muted-foreground">
        Explore pre-wedding photoshoot locations in {country.name} by state — beaches, waterfalls,
        temples, hills, and more.
      </p>
      <h2 className="font-heading mb-3 text-lg font-semibold">Explore Locations by State</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {states.map((state) => (
          <Link
            key={state.slug}
            href={`/locations/${country.slug}/${state.slug}`}
            className="rounded-lg border p-4 transition-shadow hover:shadow-md"
          >
            <h2 className="text-lg font-semibold">{state.name}</h2>
            <p className="text-sm text-muted-foreground">
              {state.count} location{state.count === 1 ? "" : "s"}
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}

/** State → city chips + per-category location sections, paginated. Matches
 * the original /locations/[country]/[state] browse view. */
export function StateBrowse({
  countrySlug,
  state,
  locations,
  page,
  basePath,
  query,
}: {
  countrySlug: string;
  state: { name: string; slug: string };
  locations: PublicLocationCard[];
  page?: string;
  basePath: string;
  query: QueryRecord;
}) {
  const cityMap = new Map<string, { name: string; slug: string; count: number }>();
  const categoryMap = new Map<string, { name: string; slug: string }>();
  for (const location of locations) {
    if (location.city) {
      const existing = cityMap.get(location.city.slug);
      if (existing) existing.count += 1;
      else cityMap.set(location.city.slug, { ...location.city, count: 1 });
    }
    if (location.category) categoryMap.set(location.category.slug, location.category);
  }
  const cities = [...cityMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  const categories = [...categoryMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  const { items: pageItems, page: resolvedPage, totalPages } = paginateListing(locations, page);
  const grouped = groupLocationsByCategory(pageItems);
  const categoryNames = extractCategoryNames(locations);

  return (
    <>
      <p className="mb-2 max-w-2xl text-muted-foreground">
        {categoryNames.length > 0
          ? `Explore pre-wedding photoshoot locations in ${state.name}, including ${categoryNames
              .map((name) => name.toLowerCase())
              .join(", ")}.`
          : `Explore pre-wedding photoshoot locations in ${state.name}.`}
      </p>

      {cities.length > 0 && (
        <div className="mt-6">
          <h2 className="font-heading mb-3 text-lg font-semibold">Explore Cities in {state.name}</h2>
          <div className="flex flex-wrap gap-2">
            {cities.map((city) => (
              <Link
                key={city.slug}
                href={`/locations/${countrySlug}/${state.slug}/${city.slug}`}
                className="rounded-full border px-3 py-1 text-sm hover:bg-muted"
              >
                {city.name} ({city.count})
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8">
        {categories.map((category) => {
          const items = grouped.get(category.slug) ?? [];
          if (items.length === 0) return null;
          return (
            <section key={category.slug} className="mb-14">
              <Link
                href={`/locations/${countrySlug}/${state.slug}/${category.slug}`}
                className="group inline-block"
              >
                <h2 className="font-heading mb-4 text-2xl font-semibold group-hover:underline">
                  {category.name} locations in {state.name}
                </h2>
              </Link>
              <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
                {items.map((location) => (
                  <LocationCard key={location.id} location={location} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <ListingPagination page={resolvedPage} totalPages={totalPages} basePath={basePath} query={query} />
    </>
  );
}

/** City → per-category location sections, paginated. Matches the original
 * /locations/[country]/[state]/[city] browse view. */
export function CityBrowse({
  countrySlug,
  state,
  city,
  locations,
  page,
  basePath,
  query,
}: {
  countrySlug: string;
  state: { name: string; slug: string };
  city: { name: string; slug: string };
  locations: PublicLocationCard[];
  page?: string;
  basePath: string;
  query: QueryRecord;
}) {
  const categoryMap = new Map<string, { name: string; slug: string }>();
  for (const location of locations) {
    if (location.category) categoryMap.set(location.category.slug, location.category);
  }
  const categories = [...categoryMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  const { items: pageItems, page: resolvedPage, totalPages } = paginateListing(locations, page);
  const grouped = groupLocationsByCategory(pageItems);
  const categoryNames = extractCategoryNames(locations);

  return (
    <>
      <p className="mb-2 max-w-2xl text-muted-foreground">
        {categoryNames.length > 0
          ? `Explore pre-wedding photoshoot locations in ${city.name}, ${state.name}, including ${categoryNames
              .map((name) => name.toLowerCase())
              .join(", ")}.`
          : `Explore pre-wedding photoshoot locations in ${city.name}, ${state.name}.`}
      </p>

      <div className="mt-8">
        {categories.map((category) => {
          const items = grouped.get(category.slug) ?? [];
          if (items.length === 0) return null;
          return (
            <section key={category.slug} className="mb-14">
              <Link
                href={`/locations/${countrySlug}/${state.slug}/${city.slug}/${category.slug}`}
                className="group inline-block"
              >
                <h2 className="font-heading mb-4 text-2xl font-semibold group-hover:underline">
                  {category.name} locations in {city.name}
                </h2>
              </Link>
              <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
                {items.map((location) => (
                  <LocationCard key={location.id} location={location} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <ListingPagination page={resolvedPage} totalPages={totalPages} basePath={basePath} query={query} />
    </>
  );
}

/** Plain flat grid + pagination for a list of locations (used by filtered
 * result views and the flat city+category / state+category / category
 * canonical grids). The heading is rendered by the caller. */
export function LocationGrid({
  locations,
  page,
  basePath,
  query,
  emptyMessage,
}: {
  locations: PublicLocationCard[];
  page?: string;
  basePath: string;
  query: QueryRecord;
  emptyMessage?: string;
}) {
  const { items, page: resolvedPage, totalPages } = paginateListing(locations, page);
  return (
    <>
      {items.length === 0 ? (
        <p className="text-muted-foreground">
          {emptyMessage ?? "No published locations match these filters yet. Try a different combination."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((location) => (
            <LocationCard key={location.id} location={location} />
          ))}
        </div>
      )}
      <ListingPagination page={resolvedPage} totalPages={totalPages} basePath={basePath} query={query} />
    </>
  );
}

/** Heading + flat grid for the flat canonical pages (city+category,
 * state+category, nationwide category). */
export function FlatBrowse({
  heading,
  locations,
  page,
  basePath,
  query,
  emptyMessage,
}: {
  heading: string;
  locations: PublicLocationCard[];
  page?: string;
  basePath: string;
  query: QueryRecord;
  emptyMessage?: string;
}) {
  return (
    <>
      <h2 className="font-heading mb-6 text-xl font-semibold">{heading}</h2>
      <LocationGrid
        locations={locations}
        page={page}
        basePath={basePath}
        query={query}
        emptyMessage={emptyMessage}
      />
    </>
  );
}

/** State-level browse links for a nationwide category page — reuses the
 * already-loaded `locations` result (no extra query). Only shown for the
 * default (unfiltered) national view. */
export function CategoryExploreByState({
  category,
  locations,
}: {
  category: { name: string; slug: string };
  locations: PublicLocationCard[];
}) {
  const stateCounts = new Map<
    string,
    { name: string; slug: string; countrySlug: string; count: number }
  >();
  for (const location of locations) {
    if (!location.state || !location.country) continue;
    const existing = stateCounts.get(location.state.slug);
    if (existing) existing.count += 1;
    else {
      stateCounts.set(location.state.slug, {
        name: location.state.name,
        slug: location.state.slug,
        countrySlug: location.country.slug,
        count: 1,
      });
    }
  }
  const states = [...stateCounts.values()].sort((a, b) => a.name.localeCompare(b.name));
  if (states.length === 0) return null;

  return (
    <div className="mt-10 border-t pt-6">
      <h2 className="font-heading mb-3 text-lg font-semibold">
        Explore {category.name} Locations by State
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {states.map((state) => (
          <Link
            key={state.slug}
            href={`/locations/${state.countrySlug}/${state.slug}/${category.slug}`}
            className="rounded-lg border p-4 transition-shadow hover:shadow-md"
          >
            <h3 className="text-lg font-semibold">
              {category.name} locations in {state.name}
            </h3>
            <p className="text-sm text-muted-foreground">
              {state.count} location{state.count === 1 ? "" : "s"}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
