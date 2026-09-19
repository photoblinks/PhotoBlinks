import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/supabase/require-permission";
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
import { AdminPagination } from "@/components/admin/pagination";
import { ADMIN_PAGE_SIZE, parsePage, rangeFor } from "@/lib/admin/pagination";
import { LocationStateCategoryFilters } from "./filters";

// Mirrors the City + Category inventory pattern one geo level up —
// see src/app/admin/(shell)/seo/location-categories/page.tsx.

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

type InventoryRpcRow = {
  state_id: string;
  category_id: string;
  country_name: string;
  country_slug: string;
  state_name: string;
  state_slug: string;
  category_name: string;
  category_slug: string;
  location_count: number;
  seo_title: string | null;
  seo_description: string | null;
};

type FilterOptionsRpcRow = {
  country_name: string;
  country_slug: string;
  state_name: string;
  state_slug: string;
  category_name: string;
  category_slug: string;
};

export default async function LocationStateCategorySeoPage({ searchParams }: Props) {
  await requireAdminPage();

  const query = await searchParams;
  const q = (query.q ?? "").trim().toLowerCase();
  const sort: SortKey = query.sort === "category" || query.sort === "count" ? query.sort : "state";
  const dir: "asc" | "desc" = query.dir === "desc" ? "desc" : "asc";

  const supabase = await createClient();

  const rpcFilters = {
    p_q: q || null,
    p_country_slug: query.country || null,
    p_state_slug: query.state || null,
    p_category_slug: query.category || null,
  };

  // Count first: the inventory RPC's offset depends on the page clamped to
  // this total, so it can't run in parallel with the list call without
  // risking an out-of-range page silently returning an empty page — same
  // correctness rule as the Phase B1/B2 admin pagination.
  const { data: countData } = await supabase.rpc(
    "get_admin_seo_location_state_category_inventory_count",
    rpcFilters,
  );
  const total = Number(countData ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const currentPage = parsePage(query.page, totalPages);
  const { from } = rangeFor(currentPage);

  const [{ data: inventoryData }, { data: filterOptionsData }] = await Promise.all([
    supabase.rpc("get_admin_seo_location_state_category_inventory", {
      ...rpcFilters,
      p_sort: sort,
      p_dir: dir,
      p_limit: ADMIN_PAGE_SIZE,
      p_offset: from,
    }),
    // Unfiltered by q/country/state/category — the dropdowns must always
    // offer every option the inventory could contain, not just the options
    // visible on the current filtered/paginated page.
    supabase.rpc("get_admin_seo_location_state_category_filter_options"),
  ]);

  const inventoryRows = (inventoryData ?? []) as InventoryRpcRow[];
  const pageRows: Row[] = inventoryRows.map((row) => ({
    key: `${row.state_id}|${row.category_id}`,
    stateId: row.state_id,
    categoryId: row.category_id,
    countryName: row.country_name,
    countrySlug: row.country_slug,
    stateName: row.state_name,
    stateSlug: row.state_slug,
    categoryName: row.category_name,
    categorySlug: row.category_slug,
    count: Number(row.location_count),
    // Same slug-based path shape as the public route
    // (locations/[country]/[state]/[category]) and sitemap.ts.
    url: `/locations/${row.country_slug}/${row.state_slug}/${row.category_slug}`,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
  }));

  const filterOptionRows = (filterOptionsData ?? []) as FilterOptionsRpcRow[];
  const filterCountries = uniqueBy(filterOptionRows, (r) => r.country_slug, (r) => ({
    slug: r.country_slug,
    name: r.country_name,
  }));
  const filterStates = uniqueBy(filterOptionRows, (r) => r.state_slug, (r) => ({
    slug: r.state_slug,
    name: r.state_name,
    countrySlug: r.country_slug,
  }));
  const filterCategories = uniqueBy(filterOptionRows, (r) => r.category_slug, (r) => ({
    slug: r.category_slug,
    name: r.category_name,
  }));

  const hasAnyFilter = Boolean(q || query.country || query.state || query.category);

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
          {total === 0 ? "No State + Category pages found." : "No matching pages found."}
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

          <AdminPagination
            hrefFor={(page) => hrefFor({ page })}
            currentPage={currentPage}
            totalPages={totalPages}
            total={total}
            pageSize={ADMIN_PAGE_SIZE}
          />
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
