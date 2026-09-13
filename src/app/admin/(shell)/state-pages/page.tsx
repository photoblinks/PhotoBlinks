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

type StateRow = {
  id: string;
  name: string;
  slug: string;
  country_slug: string;
  location_count: number;
};

export default async function AdminStatePagesPage({
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
  const { data: countData } = await supabase.rpc("get_admin_state_pages_inventory_count");
  const total = Number(countData ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const currentPage = parsePage(pageParam, totalPages);
  const { from } = rangeFor(currentPage);

  const { data } = await supabase.rpc("get_admin_state_pages_inventory", {
    p_limit: ADMIN_PAGE_SIZE,
    p_offset: from,
  });
  const states = (data ?? []) as StateRow[];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">State Pages</h1>
        <p className="text-sm text-muted-foreground">
          Each state&apos;s SEO landing page — exists once at least one location is published
          there. Add a banner image, page heading, and SEO title/description.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>State</TableHead>
            <TableHead>URL</TableHead>
            <TableHead>Locations</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {states.map((state) => {
            const path = `/locations/${state.country_slug}/${state.slug}`;
            return (
              <TableRow key={state.id}>
                <TableCell className="font-medium">{state.name}</TableCell>
                <TableCell className="text-muted-foreground">{path}</TableCell>
                <TableCell>{state.location_count}</TableCell>
                <TableCell className="flex justify-end gap-2">
                  <Button render={<Link href={path} target="_blank" />} variant="outline" size="sm">
                    View page
                  </Button>
                  <Button
                    render={<Link href={`/admin/state-pages/${state.id}/edit`} />}
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

      {states.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          No state pages yet — publish a location first.
        </p>
      )}

      <AdminPagination
        hrefFor={(page) => `/admin/state-pages?page=${page}`}
        currentPage={currentPage}
        totalPages={totalPages}
        total={total}
        pageSize={ADMIN_PAGE_SIZE}
      />
    </div>
  );
}
