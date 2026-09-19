import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAuthorizedStaffUser, PERMISSION } from "@/lib/supabase/require-permission";
import { LocationRowActions } from "@/components/admin/location-row-actions";
import { formatPricing } from "@/lib/format";
import { isSeoEligible, seoEligibilityLabel } from "@/lib/seo-eligibility";
import { AdminListFilters } from "@/components/admin/admin-list-filters";
import { AdminPagination } from "@/components/admin/pagination";
import { ADMIN_PAGE_SIZE, parsePage, rangeFor } from "@/lib/admin/pagination";

type LocationFilters = {
  q?: string;
  country?: string;
  state?: string;
  city?: string;
  category?: string;
};

export default async function AdminLocationsPage({
  searchParams,
}: {
  searchParams: Promise<
    LocationFilters & { page?: string }
  >;
}) {
  const staff = await getAuthorizedStaffUser();
  if (!staff) redirect("/admin/login");
  if (!staff.canAny([PERMISSION.LOCATIONS_EDIT, PERMISSION.LOCATIONS_PUBLISH])) redirect("/admin");

  const { q, country, state, city, category, page: pageParam } = await searchParams;
  const filters: LocationFilters = { q, country, state, city, category };
  const supabase = await createClient();

  // Count first (same filters, no columns/joins): the data query's range
  // depends on the page clamped to this total, so it can't run in parallel
  // without risking an out-of-range page silently returning an empty page
  // — same correctness rule as the Phase B1 moderation RPCs.
  let countQuery = supabase.from("locations").select("id", { count: "exact", head: true });
  if (q) countQuery = countQuery.ilike("name", `%${q}%`);
  if (country) countQuery = countQuery.eq("country_id", country);
  if (state) countQuery = countQuery.eq("state_id", state);
  if (city) countQuery = countQuery.eq("city_id", city);
  if (category) countQuery = countQuery.eq("category_id", category);
  const { count } = await countQuery;
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const currentPage = parsePage(pageParam, totalPages);
  const { from, to } = rangeFor(currentPage);

  let dataQuery = supabase
    .from("locations")
    .select(
      "*, categories(name, slug), states(name), cities(name, slug), location_images(image_url, sort_order)",
    )
    .order("created_at", { ascending: false })
    .range(from, to);
  if (q) dataQuery = dataQuery.ilike("name", `%${q}%`);
  if (country) dataQuery = dataQuery.eq("country_id", country);
  if (state) dataQuery = dataQuery.eq("state_id", state);
  if (city) dataQuery = dataQuery.eq("city_id", city);
  if (category) dataQuery = dataQuery.eq("category_id", category);

  const [{ data: locations }, { data: countries }, { data: states }, { data: categories }, { data: allLocationsForFilters }] =
    await Promise.all([
      dataQuery,
      supabase.from("countries").select("id, name").order("name"),
      supabase.from("states").select("id, name, country_id").order("name"),
      supabase.from("categories").select("id, name").order("sort_order"),
      // Unfiltered, so the City dropdown always offers every city that has
      // at least one location, regardless of the currently applied filters.
      // Not part of the paginated location list — this is filter-option
      // metadata for the whole table, so it isn't scoped to the current page.
      supabase.from("locations").select("cities(id, name, state_id)"),
    ]);

  // City + Category SEO eligibility count shown alongside each location.
  // Scoped to only the city/category ids present on this page (not every
  // published location in the table) — narrowed from a full-table scan to
  // the handful of ids this page actually needs, per the Phase B2 audit.
  const pageCityIds = [...new Set((locations ?? []).map((l) => l.city_id).filter((v): v is string => Boolean(v)))];
  const pageCategoryIds = [
    ...new Set((locations ?? []).map((l) => l.category_id).filter((v): v is string => Boolean(v))),
  ];
  const { data: publishedForSeo } =
    pageCityIds.length && pageCategoryIds.length
      ? await supabase
          .from("locations")
          .select("city_id, category_id")
          .eq("is_published", true)
          .in("city_id", pageCityIds)
          .in("category_id", pageCategoryIds)
      : { data: [] as { city_id: string | null; category_id: string | null }[] };

  const seoCounts = new Map<string, number>();
  for (const location of publishedForSeo ?? []) {
    if (!location.city_id || !location.category_id) continue;
    const key = `${location.city_id}|${location.category_id}`;
    seoCounts.set(key, (seoCounts.get(key) ?? 0) + 1);
  }

  const cityOptions = new Map<string, { id: string; name: string; state_id: string }>();
  for (const location of allLocationsForFilters ?? []) {
    const cityRef = Array.isArray(location.cities) ? location.cities[0] : location.cities;
    if (cityRef) cityOptions.set(cityRef.id, cityRef);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Locations</h1>
        {staff.can(PERMISSION.LOCATIONS_EDIT) && (
          <Button render={<Link href="/admin/locations/new" />}>Add location</Button>
        )}
      </div>

      <AdminListFilters
        basePath="/admin/locations"
        countries={countries ?? []}
        states={states ?? []}
        cities={[...cityOptions.values()]}
        categories={categories ?? []}
        initial={{ q, country, state, city, category }}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Image</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>State</TableHead>
            <TableHead>City</TableHead>
            <TableHead>Pricing</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>SEO</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {locations?.map((location) => {
            const primaryImage = [...(location.location_images ?? [])].sort(
              (a, b) => a.sort_order - b.sort_order,
            )[0]?.image_url;

            const categorySlug = location.categories?.slug;
            const citySlug = location.cities?.slug;
            const seoCount =
              location.city_id && location.category_id
                ? (seoCounts.get(`${location.city_id}|${location.category_id}`) ?? 0)
                : null;
            const seoHref =
              citySlug && categorySlug
                ? `/admin/seo/location-categories?city=${citySlug}&category=${categorySlug}`
                : undefined;

            return (
              <TableRow key={location.id}>
                <TableCell>
                  {primaryImage ? (
                    <div className="relative h-10 w-10 overflow-hidden rounded">
                      <Image src={primaryImage} alt="" fill className="object-cover" unoptimized />
                    </div>
                  ) : (
                    <div className="h-10 w-10 rounded bg-muted" />
                  )}
                </TableCell>
                <TableCell className="font-medium">{location.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {location.categories?.name ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {location.states?.name ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {location.cities?.name ?? "—"}
                </TableCell>
                <TableCell>{formatPricing(location.pricing_type, location.price)}</TableCell>
                <TableCell>
                  <Badge variant={location.is_published ? "default" : "secondary"}>
                    {location.is_published ? "Published" : "Unpublished"}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {seoCount === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <Badge
                      render={seoHref ? <Link href={seoHref} /> : undefined}
                      variant={isSeoEligible(seoCount) ? "default" : "secondary"}
                    >
                      {seoCount} location{seoCount === 1 ? "" : "s"} · {seoEligibilityLabel(seoCount)}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="flex justify-end gap-2">
                  {staff.can(PERMISSION.LOCATIONS_EDIT) && (
                    <Button
                      render={<Link href={`/admin/locations/${location.id}/edit`} />}
                      variant="outline"
                      size="sm"
                    >
                      Edit
                    </Button>
                  )}
                  <LocationRowActions
                    id={location.id}
                    isPublished={location.is_published}
                    canPublish={staff.can(PERMISSION.LOCATIONS_PUBLISH)}
                    canDelete={staff.isAdmin}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {locations?.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">No locations yet.</p>
      )}

      <AdminPagination
        hrefFor={(page) => hrefFor(filters, page)}
        currentPage={currentPage}
        totalPages={totalPages}
        total={total}
        pageSize={ADMIN_PAGE_SIZE}
      />
    </div>
  );
}

function hrefFor(filters: LocationFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.country) params.set("country", filters.country);
  if (filters.state) params.set("state", filters.state);
  if (filters.city) params.set("city", filters.city);
  if (filters.category) params.set("category", filters.category);
  params.set("page", String(page));
  return `/admin/locations?${params.toString()}`;
}
