import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/supabase/require-permission";
import { Badge } from "@/components/ui/badge";
import { PhotographerStatusActions } from "@/components/admin/photographer-status-actions";
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

/** Photographer signups waiting for approval (status "on_hold"). Approving
 * activates the profile; rejecting suspends it. Both reuse
 * setPhotographerStatus, the same admin-gated action as the profile page. */
export default async function AdminPhotographerRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdminPage();

  const { page: pageParam } = await searchParams;
  const supabase = await createClient();
  const { data: countData } = await supabase.rpc("get_admin_photographer_profiles_count", {
    p_status: "on_hold",
    p_search: null,
  });

  const total = Number(countData ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const currentPage = parsePage(pageParam, totalPages);
  const { from } = rangeFor(currentPage);

  const { data } = await supabase.rpc("get_admin_photographer_profiles", {
    p_status: "on_hold",
    p_search: null,
    p_limit: ADMIN_PAGE_SIZE,
    p_offset: from,
  });
  const requests = (data ?? []) as PhotographerProfileRow[];
  const { data: unverified } = requests.length
    ? await supabase.rpc("get_unverified_user_ids", { p_ids: requests.map((r) => r.user_id) })
    : { data: [] as string[] };
  const unverifiedIds = new Set<string>((unverified ?? []) as string[]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Photographer Requests</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        New photographer signups. A profile goes live only after you approve it.
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Photographer</TableHead>
            <TableHead>Studio</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Requested</TableHead>
            <TableHead>Decision</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <Link
                  href={`/admin/photographer-profiles/${row.id}`}
                  className="font-medium text-pb-brand hover:underline"
                >
                  {row.display_name}
                </Link>
                <p className="text-xs text-muted-foreground">{row.email}</p>
                <Badge variant={unverifiedIds.has(row.user_id) ? "secondary" : "default"} className="mt-1">
                  {unverifiedIds.has(row.user_id) ? "Email not verified" : "Email verified"}
                </Badge>
              </TableCell>
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
              <TableCell>
                <PhotographerStatusActions id={row.id} current="on_hold" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {requests.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">No pending requests.</p>
      )}

      <AdminPagination
        hrefFor={(page) => `/admin/photographer-requests?page=${page}`}
        currentPage={currentPage}
        totalPages={totalPages}
        total={total}
        pageSize={ADMIN_PAGE_SIZE}
      />
    </div>
  );
}
