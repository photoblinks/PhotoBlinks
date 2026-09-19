import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/supabase/require-permission";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LocationReportModerationActions } from "@/components/admin/location-report-moderation-actions";
import { AdminPagination } from "@/components/admin/pagination";
import { RealtimeRefresh } from "@/components/realtime/realtime-refresh";
import { ADMIN_PAGE_SIZE, parsePage, rangeFor } from "@/lib/admin/pagination";

type ReportRow = {
  id: string;
  location_id: string;
  location_name: string;
  location_slug: string;
  reporter_label: "Anonymous" | "Registered user" | "Photographer";
  report_type: string;
  message: string;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  reviewed_at: string | null;
  created_at: string;
};

const STATUS_TABS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
] as const;

type StatusFilter = (typeof STATUS_TABS)[number]["value"];

const STATUS_BADGE_VARIANT: Record<string, "secondary" | "default" | "destructive"> = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
};

const REPORT_TYPE_LABELS: Record<string, string> = {
  incorrect_information: "Incorrect information",
  location_closed: "Location appears closed",
  wrong_location: "Wrong location/details",
  inappropriate_content: "Inappropriate content",
  duplicate: "Duplicate location",
  other: "Other",
};

export default async function AdminLocationReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requireAdminPage();

  const { status: statusParam, page: pageParam } = await searchParams;
  const status: StatusFilter = STATUS_TABS.some((t) => t.value === statusParam)
    ? (statusParam as StatusFilter)
    : "pending";
  const p_status = status === "all" ? null : status;

  const supabase = await createClient();

  // Count first: the list RPC's offset depends on the page clamped to the
  // total, so this can't run in parallel with the list call without risking
  // an out-of-range page silently returning an empty page while the header
  // still claims a smaller, valid page number.
  const { data: countData } = await supabase.rpc("get_admin_location_reports_count", { p_status });
  const total = Number(countData ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const currentPage = parsePage(pageParam, totalPages);
  const { from } = rangeFor(currentPage);

  const { data } = await supabase.rpc("get_admin_location_reports", {
    p_status,
    p_limit: ADMIN_PAGE_SIZE,
    p_offset: from,
  });
  const reports = (data ?? []) as ReportRow[];

  function hrefFor(page: number) {
    const params = new URLSearchParams();
    if (status !== "pending") params.set("status", status);
    params.set("page", String(page));
    return `/admin/location-reports?${params.toString()}`;
  }

  return (
    <div>
      <RealtimeRefresh table="location_reports" />
      <h1 className="mb-6 text-2xl font-semibold">Location Reports</h1>

      <div className="mb-6 flex gap-1">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={`/admin/location-reports?status=${tab.value}`}
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
            <TableHead>Location</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Message</TableHead>
            <TableHead>Reporter</TableHead>
            <TableHead>Submitted</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reports.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <Link
                  href={`/location/${row.location_slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-pb-brand hover:underline"
                >
                  {row.location_name}
                </Link>
              </TableCell>
              <TableCell className="text-sm">
                {REPORT_TYPE_LABELS[row.report_type] ?? row.report_type}
              </TableCell>
              <TableCell className="max-w-xs">
                <p className="line-clamp-3 text-sm">{row.message}</p>
                {row.admin_note && (
                  <p className="mt-1 text-xs text-muted-foreground">Note: {row.admin_note}</p>
                )}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{row.reporter_label}</TableCell>
              <TableCell className="text-muted-foreground">
                {new Date(row.created_at).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_BADGE_VARIANT[row.status] ?? "secondary"}>{row.status}</Badge>
              </TableCell>
              <TableCell className="text-right">
                {row.status === "pending" ? (
                  <LocationReportModerationActions id={row.id} />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {row.reviewed_at &&
                      new Date(row.reviewed_at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {reports.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          No {status === "all" ? "" : status} reports.
        </p>
      )}

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
