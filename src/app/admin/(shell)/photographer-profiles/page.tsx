import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/supabase/require-permission";
import { Badge } from "@/components/ui/badge";
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
import {
  PHOTOGRAPHER_STATUS_LABEL,
  type PhotographerProfileRow,
  type PhotographerStatus,
} from "./types";

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On hold" },
  { value: "suspended", label: "Suspended" },
] as const;

type StatusFilter = (typeof STATUS_TABS)[number]["value"];

const STATUS_VARIANT: Record<PhotographerStatus, "default" | "secondary" | "destructive"> = {
  active: "default",
  on_hold: "secondary",
  suspended: "destructive",
};

export default async function AdminPhotographerProfilesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; q?: string }>;
}) {
  await requireAdminPage();

  const { status: statusParam, page: pageParam, q: qParam } = await searchParams;
  const status: StatusFilter = STATUS_TABS.some((t) => t.value === statusParam)
    ? (statusParam as StatusFilter)
    : "all";
  const q = String(qParam ?? "").trim();
  const p_status = status === "all" ? null : status;

  const supabase = await createClient();
  const { data: countData } = await supabase.rpc("get_admin_photographer_profiles_count", {
    p_status,
    p_search: q || null,
  });

  const total = Number(countData ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const currentPage = parsePage(pageParam, totalPages);
  const { from } = rangeFor(currentPage);

  const { data } = await supabase.rpc("get_admin_photographer_profiles", {
    p_status,
    p_search: q || null,
    p_limit: ADMIN_PAGE_SIZE,
    p_offset: from,
  });
  const photographers = (data ?? []) as PhotographerProfileRow[];

  function queryFor(overrides: { status?: StatusFilter; page?: number }) {
    const params = new URLSearchParams();
    const s = overrides.status ?? status;
    if (s !== "all") params.set("status", s);
    if (q) params.set("q", q);
    if (overrides.page) params.set("page", String(overrides.page));
    const qs = params.toString();
    return `/admin/photographer-profiles${qs ? `?${qs}` : ""}`;
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Photographer Profiles</h1>

      <form className="mb-4 flex max-w-md gap-2">
        {status !== "all" && <input type="hidden" name="status" value={status} />}
        <Input name="q" defaultValue={q} placeholder="Search name, studio, email or phone" />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      <div className="mb-6 flex gap-1">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={queryFor({ status: tab.value })}
            aria-current={tab.value === status ? "true" : undefined}
            className={
              tab.value === status
                ? "rounded-full bg-pb-brand px-3 py-1.5 text-sm font-medium text-white"
                : "rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            }
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Photographer</TableHead>
            <TableHead>Studio</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Signed up</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {photographers.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <p className="font-medium">{row.display_name}</p>
                <p className="text-xs text-muted-foreground">{row.email}</p>
              </TableCell>
              <TableCell>{row.studio_name}</TableCell>
              <TableCell className="text-muted-foreground">
                {[row.city, row.state_name, row.country_name].filter(Boolean).join(", ")}
              </TableCell>
              <TableCell className="text-muted-foreground">{row.phone_number}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[row.status]}>{PHOTOGRAPHER_STATUS_LABEL[row.status]}</Badge>
              </TableCell>
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

      {photographers.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">No photographers found.</p>
      )}

      <AdminPagination
        hrefFor={(page) => queryFor({ page })}
        currentPage={currentPage}
        totalPages={totalPages}
        total={total}
        pageSize={ADMIN_PAGE_SIZE}
      />
    </div>
  );
}
