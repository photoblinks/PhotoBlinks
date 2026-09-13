import Link from "next/link";
import Image from "next/image";
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
import { deleteStudio, toggleStudioPublished } from "./actions";
import { AdminListFilters } from "@/components/admin/admin-list-filters";
import { AdminPagination } from "@/components/admin/pagination";
import { ADMIN_PAGE_SIZE, parsePage, rangeFor } from "@/lib/admin/pagination";

type StudioFilters = { q?: string; country?: string; state?: string; city?: string };

function studioHrefFor(filters: StudioFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.country) params.set("country", filters.country);
  if (filters.state) params.set("state", filters.state);
  if (filters.city) params.set("city", filters.city);
  params.set("page", String(page));
  return `/admin/studios?${params.toString()}`;
}

export default async function AdminStudiosPage({
  searchParams,
}: {
  searchParams: Promise<StudioFilters & { page?: string }>;
}) {
  const { q, country, state, city, page: pageParam } = await searchParams;
  const filters: StudioFilters = { q, country, state, city };
  const supabase = await createClient();

  // Count first: the data query's range depends on the page clamped to this
  // total, so it can't run in parallel without risking an out-of-range page
  // silently returning an empty page — same rule as Phase B1.
  let countQuery = supabase.from("studios").select("id", { count: "exact", head: true });
  if (q) countQuery = countQuery.ilike("name", `%${q}%`);
  if (country) countQuery = countQuery.eq("country_id", country);
  if (state) countQuery = countQuery.eq("state_id", state);
  if (city) countQuery = countQuery.eq("city_id", city);
  const { count } = await countQuery;
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const currentPage = parsePage(pageParam, totalPages);
  const { from, to } = rangeFor(currentPage);

  let query = supabase
    .from("studios")
    .select("*, states(name), cities(name), studio_images(image_url, sort_order)")
    .order("created_at", { ascending: false })
    .range(from, to);

  if (q) query = query.ilike("name", `%${q}%`);
  if (country) query = query.eq("country_id", country);
  if (state) query = query.eq("state_id", state);
  if (city) query = query.eq("city_id", city);

  const [{ data: studios }, { data: countries }, { data: states }, { data: allStudiosForFilters }] =
    await Promise.all([
      query,
      supabase.from("countries").select("id, name").order("name"),
      supabase.from("states").select("id, name, country_id").order("name"),
      // Unfiltered, so the City dropdown always offers every city that has
      // at least one studio, regardless of the currently applied filters.
      // Not part of the paginated studio list — filter-option metadata for
      // the whole table, so it isn't scoped to the current page.
      supabase.from("studios").select("cities(id, name, state_id)"),
    ]);

  const cityOptions = new Map<string, { id: string; name: string; state_id: string }>();
  for (const studio of allStudiosForFilters ?? []) {
    const cityRef = Array.isArray(studio.cities) ? studio.cities[0] : studio.cities;
    if (cityRef) cityOptions.set(cityRef.id, cityRef);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Studios</h1>
        <Button render={<Link href="/admin/studios/new" />}>Add studio</Button>
      </div>

      <AdminListFilters
        basePath="/admin/studios"
        countries={countries ?? []}
        states={states ?? []}
        cities={[...cityOptions.values()]}
        initial={{ q, country, state, city }}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Image</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>State</TableHead>
            <TableHead>City</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {studios?.map((studio) => {
            const primaryImage = [...(studio.studio_images ?? [])].sort(
              (a, b) => a.sort_order - b.sort_order,
            )[0]?.image_url;

            return (
              <TableRow key={studio.id}>
                <TableCell>
                  {primaryImage ? (
                    <div className="relative h-10 w-10 overflow-hidden rounded">
                      <Image src={primaryImage} alt="" fill className="object-cover" unoptimized />
                    </div>
                  ) : (
                    <div className="h-10 w-10 rounded bg-muted" />
                  )}
                </TableCell>
                <TableCell className="font-medium">{studio.name}</TableCell>
                <TableCell className="text-muted-foreground">{studio.states?.name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{studio.cities?.name ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={studio.is_published ? "default" : "secondary"}>
                    {studio.is_published ? "Published" : "Unpublished"}
                  </Badge>
                </TableCell>
                <TableCell className="flex justify-end gap-2">
                  <Button
                    render={<Link href={`/admin/studios/${studio.id}/edit`} />}
                    variant="outline"
                    size="sm"
                  >
                    Edit
                  </Button>
                  <form action={toggleStudioPublished.bind(null, studio.id, !studio.is_published)}>
                    <Button type="submit" variant="outline" size="sm">
                      {studio.is_published ? "Unpublish" : "Publish"}
                    </Button>
                  </form>
                  <form action={deleteStudio.bind(null, studio.id)}>
                    <Button type="submit" variant="destructive" size="sm">
                      Delete
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {studios?.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">No studios yet.</p>
      )}

      <AdminPagination
        hrefFor={(page) => studioHrefFor(filters, page)}
        currentPage={currentPage}
        totalPages={totalPages}
        total={total}
        pageSize={ADMIN_PAGE_SIZE}
      />
    </div>
  );
}
