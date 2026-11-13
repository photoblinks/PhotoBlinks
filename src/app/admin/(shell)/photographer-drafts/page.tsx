import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/supabase/require-permission";
import { Input } from "@/components/ui/input";
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
import type { PhotographerProfileRow } from "../photographer-profiles/types";

export default async function AdminPhotographerDraftsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  await requireAdminPage();

  const { page: pageParam, q: qParam } = await searchParams;
  const q = String(qParam ?? "").trim();

  const supabase = await createClient();
  const { data: count } = await supabase.rpc("get_admin_photographer_profiles_count", {
    p_status: "draft",
    p_search: q || null,
  });
  const total = Number(count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const currentPage = parsePage(pageParam, totalPages);
  const { from } = rangeFor(currentPage);

  const { data } = await supabase.rpc("get_admin_photographer_profiles", {
    p_status: "draft",
    p_search: q || null,
    p_limit: ADMIN_PAGE_SIZE,
    p_offset: from,
  });
  const drafts = (data ?? []) as PhotographerProfileRow[];

  function hrefFor(page: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    return `/admin/photographer-drafts${qs ? `?${qs}` : ""}`;
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Photographer Drafts ({total})</h1>

      <form className="mb-6 flex max-w-md gap-2">
        <Input name="q" defaultValue={q} placeholder="Search name, studio, email or phone" />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Photographer</TableHead>
            <TableHead>Studio</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Imported</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {drafts.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">{row.display_name}</TableCell>
              <TableCell>{row.studio_name}</TableCell>
              <TableCell className="text-muted-foreground">
                {[row.city, row.state_name, row.country_name].filter(Boolean).join(", ")}
              </TableCell>
              <TableCell className="text-muted-foreground">{row.phone_number}</TableCell>
              <TableCell className="text-muted-foreground">
                {new Date(row.created_at).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </TableCell>
              <TableCell className="text-right">
                <Link
                  href={`/admin/photographer-profiles/${row.id}`}
                  className="text-sm text-pb-brand hover:underline"
                >
                  View / Edit
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {drafts.length === 0 && <p className="mt-6 text-sm text-muted-foreground">No drafts found.</p>}

      <AdminPagination
        hrefFor={hrefFor}
        currentPage={currentPage}
        totalPages={totalPages}
        total={total}
        pageSize={ADMIN_PAGE_SIZE}
      />
    </div>
  );
}
