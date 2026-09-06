import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { isSeoEligible, seoEligibilityLabel } from "@/lib/seo-eligibility";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LocationCategoryFilters } from "./filters";

// Keeps the inventory list from ever growing unbounded on one page as the
// number of city+category combinations increases — see PHASE 1 spec
// (§5 Pagination).
const PAGE_SIZE = 20;

type Ref = { id: string; name: string; slug: string };
type SortKey = "city" | "category" | "count";

type Props = {
  searchParams: Promise<{
    q?: string;
    country?: string;
    state?: string;
    city?: string;
    category?: string;
    sort?: string;
    dir?: string;
    page?: string;
  }>;
};

type Row = {
  key: string;
  cityId: string;
  categoryId: string;
  countryName: string;
  countrySlug: string;
  stateName: string;
  stateSlug: string;
  cityName: string;
  citySlug: string;
  categoryName: string;
  categorySlug: string;
  count: number;
  url: string;
  seoTitle: string | null;
  seoDescription: string | null;
};

export default async function LocationCategorySeoPage({ searchParams }: Props) {
  const query = await searchParams;
  const q = (query.q ?? "").trim().toLowerCase();
  const sort: SortKey = query.sort === "category" || query.sort === "count" ? query.sort : "city";
  const dir: "asc" | "desc" = query.dir === "desc" ? "desc" : "asc";
  const page = Math.max(1, Number(query.page) || 1);

  const supabase = await createClient();

  // Only the four FK columns — mirrors the existing city-pages admin page's
  // approach (count in JS from a narrow published-only select), extended
  // with category. This is the same relationship the public City+Category
  // route and sitemap.ts already use to decide a page/URL exists: at least
  // one published location matching country+state+city+category.
  const { data: locations } = await supabase
    .from("locations")
    .select("country_id, state_id, city_id, category_id")
    .eq("is_published", true);

  const counts = new Map<string, number>();
  for (const location of locations ?? []) {
    if (!location.country_id || !location.state_id || !location.city_id || !location.category_id) {
      continue;
    }
    const key = `${location.country_id}|${location.state_id}|${location.city_id}|${location.category_id}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const countryIds = new Set<string>();
  const stateIds = new Set<string>();
  const cityIds = new Set<string>();
  const categoryIds = new Set<string>();
  for (const key of counts.keys()) {
    const [countryId, stateId, cityId, categoryId] = key.split("|");
    countryIds.add(countryId);
    stateIds.add(stateId);
    cityIds.add(cityId);
    categoryIds.add(categoryId);
  }

  // Batched, scoped to only the ids actually referenced above — same
  // `.in("id", ids)` pattern the existing city-pages admin page uses,
  // avoids both N+1 queries and fetching the full reference tables.
  const [{ data: countries }, { data: states }, { data: cities }, { data: categories }] =
    await Promise.all([
      countryIds.size
        ? supabase.from("countries").select("id, name, slug").in("id", [...countryIds])
        : Promise.resolve({ data: [] as Ref[] }),
      stateIds.size
        ? supabase.from("states").select("id, name, slug, country_id").in("id", [...stateIds])
        : Promise.resolve({ data: [] as (Ref & { country_id: string })[] }),
      cityIds.size
        ? supabase.from("cities").select("id, name, slug, state_id").in("id", [...cityIds])
        : Promise.resolve({ data: [] as (Ref & { state_id: string })[] }),
      categoryIds.size
        ? supabase.from("categories").select("id, name, slug").in("id", [...categoryIds])
        : Promise.resolve({ data: [] as Ref[] }),
    ]);

  const countryById = new Map((countries ?? []).map((c) => [c.id, c]));
  const stateById = new Map((states ?? []).map((s) => [s.id, s]));
  const cityById = new Map((cities ?? []).map((c) => [c.id, c]));
  const categoryById = new Map((categories ?? []).map((c) => [c.id, c]));

  // SEO overrides for the (city, category) pairs referenced above — narrow,
  // batched by the already-scoped id sets, same pattern as the reference
  // lookups. Keyed for O(1) lookup while building rows below.
  const { data: seoRows } = cityIds.size
    ? await supabase
        .from("location_category_seo")
        .select("city_id, category_id, meta_title, meta_description")
        .in("city_id", [...cityIds])
    : { data: [] as { city_id: string; category_id: string; meta_title: string | null; meta_description: string | null }[] };
  const seoByKey = new Map((seoRows ?? []).map((s) => [`${s.city_id}|${s.category_id}`, s]));

  const allRows: Row[] = [];
  for (const [key, count] of counts) {
    const [countryId, stateId, cityId, categoryId] = key.split("|");
    const country = countryById.get(countryId);
    const state = stateById.get(stateId);
    const city = cityById.get(cityId);
    const category = categoryById.get(categoryId);
    if (!country || !state || !city || !category) continue; // stale/inactive ref — skip, don't guess

    const seo = seoByKey.get(`${cityId}|${categoryId}`);

    allRows.push({
      key,
      cityId,
      categoryId,
      countryName: country.name,
      countrySlug: country.slug,
      stateName: state.name,
      stateSlug: state.slug,
      cityName: city.name,
      citySlug: city.slug,
      categoryName: category.name,
      categorySlug: category.slug,
      count,
      // Same slug-based path shape as the public route
      // (locations/[country]/[state]/[city]/[category]) and sitemap.ts.
      url: `/locations/${country.slug}/${state.slug}/${city.slug}/${category.slug}`,
      seoTitle: seo?.meta_title ?? null,
      seoDescription: seo?.meta_description ?? null,
    });
  }

  // Distinct filter options, derived from the same computed rows — no
  // extra query. Kept scoped to what actually exists so the dropdowns
  // never offer a combination with zero pages.
  const filterCountries = uniqueBy(allRows, (r) => r.countrySlug, (r) => ({
    slug: r.countrySlug,
    name: r.countryName,
  }));
  const filterStates = uniqueBy(allRows, (r) => r.stateSlug, (r) => ({
    slug: r.stateSlug,
    name: r.stateName,
    countrySlug: r.countrySlug,
  }));
  const filterCities = uniqueBy(allRows, (r) => r.citySlug, (r) => ({
    slug: r.citySlug,
    name: r.cityName,
    stateSlug: r.stateSlug,
  }));
  const filterCategories = uniqueBy(allRows, (r) => r.categorySlug, (r) => ({
    slug: r.categorySlug,
    name: r.categoryName,
  }));

  let rows = allRows;
  if (query.country) rows = rows.filter((r) => r.countrySlug === query.country);
  if (query.state) rows = rows.filter((r) => r.stateSlug === query.state);
  if (query.city) rows = rows.filter((r) => r.citySlug === query.city);
  if (query.category) rows = rows.filter((r) => r.categorySlug === query.category);
  if (q) {
    rows = rows.filter(
      (r) =>
        r.cityName.toLowerCase().includes(q) ||
        r.stateName.toLowerCase().includes(q) ||
        r.categoryName.toLowerCase().includes(q) ||
        r.countryName.toLowerCase().includes(q),
    );
  }

  const hasAnyFilter = Boolean(q || query.country || query.state || query.city || query.category);

  const sortMultiplier = dir === "desc" ? -1 : 1;
  rows = [...rows].sort((a, b) => {
    if (sort === "count") return (a.count - b.count) * sortMultiplier;
    if (sort === "category") return a.categoryName.localeCompare(b.categoryName) * sortMultiplier;
    return a.cityName.localeCompare(b.cityName) * sortMultiplier;
  });

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function hrefFor(overrides: Record<string, string | number | undefined>) {
    const params = new URLSearchParams();
    const merged = {
      q: query.q,
      country: query.country,
      state: query.state,
      city: query.city,
      category: query.category,
      sort: query.sort,
      dir: query.dir,
      page: query.page,
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined && value !== "") params.set(key, String(value));
    }
    const qs = params.toString();
    return qs ? `/admin/seo/location-categories?${qs}` : "/admin/seo/location-categories";
  }

  function sortHref(key: SortKey) {
    const nextDir = sort === key && dir === "asc" ? "desc" : "asc";
    return hrefFor({ sort: key, dir: nextDir, page: undefined });
  }

  // Carries the admin's current pagination/search/filter state through the
  // edit page and back, so saving/resetting an override returns them to
  // where they were instead of resetting to page 1.
  const returnTo = hrefFor({ page: currentPage });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Location + Category SEO</h1>
        <p className="text-sm text-muted-foreground">
          View and manage all city and category SEO pages generated from published locations.
        </p>
      </div>

      <div className="mb-4 flex flex-col gap-3">
        <form action="/admin/seo/location-categories" className="flex gap-2">
          <input type="hidden" name="country" value={query.country ?? ""} />
          <input type="hidden" name="state" value={query.state ?? ""} />
          <input type="hidden" name="city" value={query.city ?? ""} />
          <input type="hidden" name="category" value={query.category ?? ""} />
          <input type="hidden" name="sort" value={query.sort ?? ""} />
          <input type="hidden" name="dir" value={query.dir ?? ""} />
          <Input
            type="text"
            name="q"
            defaultValue={query.q ?? ""}
            placeholder="Search city, state, or category…"
            className="max-w-sm"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
          {hasAnyFilter && (
            <Button render={<Link href="/admin/seo/location-categories" />} variant="outline">
              Clear
            </Button>
          )}
        </form>

        <LocationCategoryFilters
          basePath="/admin/seo/location-categories"
          countries={filterCountries}
          states={filterStates}
          cities={filterCities}
          categories={filterCategories}
          initial={{
            q: query.q,
            country: query.country,
            state: query.state,
            city: query.city,
            category: query.category,
          }}
        />
      </div>

      {pageRows.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          {allRows.length === 0
            ? "No Location + Category pages found."
            : "No matching pages found."}
        </p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Link href={sortHref("city")} className="hover:underline">
                    City{sort === "city" ? (dir === "asc" ? " ↑" : " ↓") : ""}
                  </Link>
                </TableHead>
                <TableHead>State</TableHead>
                <TableHead>
                  <Link href={sortHref("category")} className="hover:underline">
                    Category{sort === "category" ? (dir === "asc" ? " ↑" : " ↓") : ""}
                  </Link>
                </TableHead>
                <TableHead>
                  <Link href={sortHref("count")} className="hover:underline">
                    Locations{sort === "count" ? (dir === "asc" ? " ↑" : " ↓") : ""}
                  </Link>
                </TableHead>
                <TableHead>URL</TableHead>
                <TableHead>SEO Status</TableHead>
                <TableHead>SEO Title</TableHead>
                <TableHead>Meta Description</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="font-medium">{row.cityName}</TableCell>
                  <TableCell className="text-muted-foreground">{row.stateName}</TableCell>
                  <TableCell className="text-muted-foreground">{row.categoryName}</TableCell>
                  <TableCell>{row.count}</TableCell>
                  <TableCell className="text-muted-foreground">{row.url}</TableCell>
                  <TableCell>
                    <Badge variant={isSeoEligible(row.count) ? "default" : "secondary"}>
                      {seoEligibilityLabel(row.count)}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[220px]">
                    <SeoValueCell value={row.seoTitle} />
                  </TableCell>
                  <TableCell className="max-w-[220px]">
                    <SeoValueCell value={row.seoDescription} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        render={<Link href={row.url} target="_blank" rel="noopener noreferrer" />}
                        variant="outline"
                        size="sm"
                      >
                        View Page
                      </Button>
                      <Button
                        render={
                          <Link
                            href={`/admin/seo/location-categories/${row.cityId}/${row.categoryId}/edit?returnTo=${encodeURIComponent(returnTo)}`}
                          />
                        }
                        variant="outline"
                        size="sm"
                      >
                        Edit SEO
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages} · {total} result{total === 1 ? "" : "s"}
            </p>
            <div className="flex gap-2">
              <Button
                render={<Link href={hrefFor({ page: currentPage - 1 })} />}
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
              >
                Previous
              </Button>
              <Button
                render={<Link href={hrefFor({ page: currentPage + 1 })} />}
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Renders a custom SEO override truncated with a "Custom" badge, or a
 * muted "Default" label when no override exists — never shows the
 * generated fallback text here so it's never mistaken for a saved value. */
function SeoValueCell({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted-foreground">Default</span>;
  return (
    <span className="block truncate" title={value}>
      <span className="mr-1.5 rounded bg-pb-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-pb-brand">
        Custom
      </span>
      {value}
    </span>
  );
}

function uniqueBy<T, K extends string, V>(items: T[], keyFn: (item: T) => K, mapFn: (item: T) => V): V[] {
  const seen = new Map<K, V>();
  for (const item of items) {
    const key = keyFn(item);
    if (!seen.has(key)) seen.set(key, mapFn(item));
  }
  return [...seen.values()];
}
