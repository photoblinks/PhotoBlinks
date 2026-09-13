import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
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

type CountryRow = { id: string; name: string; slug: string; location_count: number };

export default async function AdminCountryPagesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const supabase = await createClient();

  // Count first: the inventory RPC's offset depends on the page clamped to
  // this total, so it can't run in parallel with the list call without
  // risking an out-of-range page silently returning an empty page — same
  // correctness rule as Phase B1/B2/B3.
  const { data: countData } = await supabase.rpc("get_admin_country_pages_inventory_count");
  const total = Number(countData ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const currentPage = parsePage(pageParam, totalPages);
  const { from } = rangeFor(currentPage);

  const { data } = await supabase.rpc("get_admin_country_pages_inventory", {
    p_limit: ADMIN_PAGE_SIZE,
    p_offset: from,
  });
  const countries = (data ?? []) as CountryRow[];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Country Pages</h1>
        <p className="text-sm text-muted-foreground">
          Each country&apos;s SEO landing page — exists once at least one location is published
          there. Add a banner image, page heading, and SEO title/description.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Country</TableHead>
            <TableHead>URL</TableHead>
            <TableHead>Locations</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {countries.map((country) => {
            const path = `/locations/${country.slug}`;
            return (
              <TableRow key={country.id}>
                <TableCell className="font-medium">{country.name}</TableCell>
                <TableCell className="text-muted-foreground">{path}</TableCell>
                <TableCell>{country.location_count}</TableCell>
                <TableCell className="flex justify-end gap-2">
                  <Button render={<Link href={path} target="_blank" />} variant="outline" size="sm">
                    View page
                  </Button>
                  <Button
                    render={<Link href={`/admin/country-pages/${country.id}/edit`} />}
                    variant="outline"
                    size="sm"
                  >
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {countries.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          No country pages yet — publish a location first.
        </p>
      )}

      <AdminPagination
        hrefFor={(page) => `/admin/country-pages?page=${page}`}
        currentPage={currentPage}
        totalPages={totalPages}
        total={total}
        pageSize={ADMIN_PAGE_SIZE}
      />
    </div>
  );
}
