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
import { LocationStateCategoryFilters } from "./filters";

// Mirrors the Phase 1 City + Category inventory pattern one geo level up —
// see src/app/admin/(shell)/seo/location-categories/page.tsx.
const PAGE_SIZE = 20;

type Ref = { id: string; name: string; slug: string };
type SortKey = "state" | "category" | "count";

type Props = {
  searchParams: Promise<{
    q?: string;
    country?: string;
    state?: string;
    category?: string;
    sort?: string;
    dir?: string;
    page?: string;
  }>;
};

type Row = {
  key: string;
  stateId: string;
  categoryId: string;
  countryName: string;
  countrySlug: string;
  stateName: string;
  stateSlug: string;
  categoryName: string;
  categorySlug: string;
  count: number;
  url: string;
  seoTitle: string | null;
  seoDescription: string | null;
};

export default async function LocationStateCategorySeoPage({ searchParams }: Props) {
  const query = await searchParams;
  const q = (query.q ?? "").trim().toLowerCase();
  const sort: SortKey = query.sort === "category" || query.sort === "count" ? query.sort : "state";
  const dir: "asc" | "desc" = query.dir === "desc" ? "desc" : "asc";
  const page = Math.max(1, Number(query.page) || 1);

  const supabase = await createClient();

  // Only the three FK columns — mirrors the City + Category inventory's
  // approach (count in JS from a narrow published-only select).
  const { data: locations } = await supabase
    .from("locations")
    .select("country_id, state_id, category_id")
    .eq("is_published", true);

  const counts = new Map<string, number>();
  for (const location of locations ?? []) {
    if (!location.country_id || !location.state_id || !location.category_id) continue;
    const key = `${location.country_id}|${location.state_id}|${location.category_id}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const countryIds = new Set<string>();
  const stateIds = new Set<string>();
  const categoryIds = new Set<string>();
  for (const key of counts.keys()) {
    const [countryId, stateId, categoryId] = key.split("|");
    countryIds.add(countryId);
    stateIds.add(stateId);
    categoryIds.add(categoryId);
  }

  const [{ data: countries }, { data: states }, { data: categories }] = await Promise.all([
    countryIds.size
      ? supabase.from("countries").select("id, name, slug").in("id", [...countryIds])
      : Promise.resolve({ data: [] as Ref[] }),
    stateIds.size
      ? supabase.from("states").select("id, name, slug, country_id").in("id", [...stateIds])
      : Promise.resolve({ data: [] as (Ref & { country_id: string })[] }),
    categoryIds.size
      ? supabase.from("categories").select("id, name, slug").in("id", [...categoryIds])
      : Promise.resolve({ data: [] as Ref[] }),
  ]);

  const countryById = new Map((countries ?? []).map((c) => [c.id, c]));
  const stateById = new Map((states ?? []).map((s) => [s.id, s]));
  const categoryById = new Map((categories ?? []).map((c) => [c.id, c]));

  // SEO overrides for the (state, category) pairs referenced above — one
  // narrow, batched query, scoped to the already-computed id sets.
  const { data: seoRows } = stateIds.size
    ? await supabase
        .from("location_state_category_seo")
        .select("state_id, category_id, meta_title, meta_description")
        .in("state_id", [...stateIds])
    : { data: [] as { state_id: string; category_id: string; meta_title: string | null; meta_description: string | null }[] };
  const seoByKey = new Map((seoRows ?? []).map((s) => [`${s.state_id}|${s.category_id}`, s]));

  const allRows: Row[] = [];
  for (const [key, count] of counts) {
    const [countryId, stateId, categoryId] = key.split("|");
    const country = countryById.get(countryId);
    const state = stateById.get(stateId);
    const category = categoryById.get(categoryId);
    if (!country || !state || !category) continue; // stale/inactive ref — skip, don't guess

    const seo = seoByKey.get(`${stateId}|${categoryId}`);

    allRows.push({
      key,
      stateId,
      categoryId,
      countryName: country.name,
      countrySlug: country.slug,
      stateName: state.name,
      stateSlug: state.slug,
      categoryName: category.name,
      categorySlug: category.slug,
      count,
      // Same slug-based path shape as the public route
      // (locations/[country]/[state]/[category]) and sitemap.ts.
      url: `/locations/${country.slug}/${state.slug}/${category.slug}`,
      seoTitle: seo?.meta_title ?? null,
      seoDescription: seo?.meta_description ?? null,
    });
  }

  const filterCountries = uniqueBy(allRows, (r) => r.countrySlug, (r) => ({
    slug: r.countrySlug,
    name: r.countryName,
  }));
  const filterStates = uniqueBy(allRows, (r) => r.stateSlug, (r) => ({
    slug: r.stateSlug,
    name: r.stateName,
    countrySlug: r.countrySlug,
  }));
  const filterCategories = uniqueBy(allRows, (r) => r.categorySlug, (r) => ({
    slug: r.categorySlug,
    name: r.categoryName,
  }));

  let rows = allRows;
  if (query.country) rows = rows.filter((r) => r.countrySlug === query.country);
  if (query.state) rows = rows.filter((r) => r.stateSlug === query.state);
  if (query.category) rows = rows.filter((r) => r.categorySlug === query.category);
  if (q) {
    rows = rows.filter(
      (r) =>
        r.stateName.toLowerCase().includes(q) ||
        r.categoryName.toLowerCase().includes(q) ||
        r.countryName.toLowerCase().includes(q),
    );
  }

  const hasAnyFilter = Boolean(q || query.country || query.state || query.category);

  const sortMultiplier = dir === "desc" ? -1 : 1;
  rows = [...rows].sort((a, b) => {
    if (sort === "count") return (a.count - b.count) * sortMultiplier;
    if (sort === "category") return a.categoryName.localeCompare(b.categoryName) * sortMultiplier;
    return a.stateName.localeCompare(b.stateName) * sortMultiplier;
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
    return qs ? `/admin/seo/location-state-categories?${qs}` : "/admin/seo/location-state-categories";
  }

  function sortHref(key: SortKey) {
    const nextDir = sort === key && dir === "asc" ? "desc" : "asc";
    return hrefFor({ sort: key, dir: nextDir, page: undefined });
  }

  const returnTo = hrefFor({ page: currentPage });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">State + Category SEO</h1>
        <p className="text-sm text-muted-foreground">
          View and manage all state and category SEO pages generated from published locations.
        </p>
      </div>

      <div className="mb-4 flex flex-col gap-3">
        <form action="/admin/seo/location-state-categories" className="flex gap-2">
          <input type="hidden" name="country" value={query.country ?? ""} />
          <input type="hidden" name="state" value={query.state ?? ""} />
          <input type="hidden" name="category" value={query.category ?? ""} />
          <input type="hidden" name="sort" value={query.sort ?? ""} />
          <input type="hidden" name="dir" value={query.dir ?? ""} />
          <Input
            type="text"
            name="q"
            defaultValue={query.q ?? ""}
            placeholder="Search state or category…"
            className="max-w-sm"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
          {hasAnyFilter && (
            <Button render={<Link href="/admin/seo/location-state-categories" />} variant="outline">
              Clear
            </Button>
          )}
        </form>

        <LocationStateCategoryFilters
          basePath="/admin/seo/location-state-categories"
          countries={filterCountries}
          states={filterStates}
          categories={filterCategories}
          initial={{
            q: query.q,
            country: query.country,
            state: query.state,
            category: query.category,
          }}
        />
      </div>

      {pageRows.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          {allRows.length === 0
            ? "No State + Category pages found."
            : "No matching pages found."}
        </p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Link href={sortHref("state")} className="hover:underline">
                    State{sort === "state" ? (dir === "asc" ? " ↑" : " ↓") : ""}
                  </Link>
                </TableHead>
                <TableHead>Country</TableHead>
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
                  <TableCell className="font-medium">{row.stateName}</TableCell>
                  <TableCell className="text-muted-foreground">{row.countryName}</TableCell>
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
                            href={`/admin/seo/location-state-categories/${row.stateId}/${row.categoryId}/edit?returnTo=${encodeURIComponent(returnTo)}`}
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
