import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
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
import { RejectSubmissionButton } from "@/components/admin/reject-submission-button";
import { RealtimeRefresh } from "@/components/realtime/realtime-refresh";
import { ADMIN_PAGE_SIZE, parsePage, rangeFor } from "@/lib/admin/pagination";
import { approveSubmission, rejectSubmission, retryCleanup } from "./actions";

type SubmissionRow = {
  id: string;
  image_url: string;
  title: string;
  description: string | null;
  phone_number: string;
  status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  r2_deletion_status: "pending" | "failed" | "deleted" | null;
  reviewed_at: string | null;
  created_at: string;
  photographer_display_name: string;
  photographer_phone: string;
  location_name: string;
  location_slug: string;
};

const R2_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  failed: "Failed",
  deleted: "Deleted",
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

export default async function AdminPhotographerPhotosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
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
  const { data: countData } = await supabase.rpc("get_admin_photographer_submissions_count", { p_status });
  const total = Number(countData ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const currentPage = parsePage(pageParam, totalPages);
  const { from } = rangeFor(currentPage);

  const { data } = await supabase.rpc("get_admin_photographer_submissions", {
    p_status,
    p_limit: ADMIN_PAGE_SIZE,
    p_offset: from,
  });
  const submissions = (data ?? []) as SubmissionRow[];

  function hrefFor(page: number) {
    const params = new URLSearchParams();
    if (status !== "pending") params.set("status", status);
    params.set("page", String(page));
    return `/admin/photographer-photos?${params.toString()}`;
  }

  return (
    <div>
      <RealtimeRefresh table="photographer_photo_submissions" />
      <h1 className="mb-6 text-2xl font-semibold">Photographer Photo Submissions</h1>

      <div className="mb-6 flex gap-1">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={`/admin/photographer-photos?status=${tab.value}`}
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
            <TableHead>Photo</TableHead>
            <TableHead>Title &amp; Description</TableHead>
            <TableHead>Photographer</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Submitted</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>R2 Cleanup</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {submissions.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <div className="relative size-20 shrink-0 overflow-hidden rounded-md border">
                  <Image
                    src={row.image_url}
                    alt={row.title}
                    fill
                    className="object-cover"
                    sizes="80px"
                  />
                </div>
              </TableCell>
              <TableCell className="max-w-xs">
                <p className="font-medium">{row.title}</p>
                {row.description && (
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                    {row.description}
                  </p>
                )}
                {row.rejection_reason && (
                  <p className="mt-1 text-xs text-destructive">
                    Reason: {row.rejection_reason}
                  </p>
                )}
              </TableCell>
              <TableCell>
                <p className="text-sm">{row.photographer_display_name}</p>
                <p className="text-xs text-muted-foreground">{row.photographer_phone}</p>
              </TableCell>
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
              <TableCell className="text-muted-foreground">
                {new Date(row.created_at).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_BADGE_VARIANT[row.status] ?? "secondary"}>
                  {row.status}
                </Badge>
              </TableCell>
              <TableCell>
                {row.status === "rejected" ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {row.r2_deletion_status ? R2_STATUS_LABEL[row.r2_deletion_status] : "Not required"}
                    </span>
                    {row.r2_deletion_status === "failed" && (
                      <form action={retryCleanup.bind(null, row.id)}>
                        <Button type="submit" variant="outline" size="sm">
                          Retry cleanup
                        </Button>
                      </form>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  {row.status !== "approved" && (
                    <form action={approveSubmission.bind(null, row.id)}>
                      <Button type="submit" variant="outline" size="sm">
                        Approve
                      </Button>
                    </form>
                  )}
                  {row.status !== "rejected" && (
                    <RejectSubmissionButton action={rejectSubmission.bind(null, row.id)} />
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {submissions.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          No {status === "all" ? "" : status} photo submissions.
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
