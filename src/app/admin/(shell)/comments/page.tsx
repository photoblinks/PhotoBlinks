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
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { AdminPagination } from "@/components/admin/pagination";
import { StarRatingDisplay } from "@/components/public/star-rating-display";
import { ADMIN_PAGE_SIZE, parsePage, rangeFor } from "@/lib/admin/pagination";
import { approveComment, rejectComment, deleteComment } from "./actions";

type CommentRow = {
  id: string;
  location_id: string;
  location_name: string;
  location_slug: string;
  author_name: string;
  comment: string | null;
  rating: number;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

const STATUS_TABS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
] as const;

type StatusFilter = (typeof STATUS_TABS)[number]["value"];

const STATUS_BADGE_VARIANT = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
} as const;

export default async function AdminCommentsPage({
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
  const { data: countData } = await supabase.rpc("get_admin_location_comments_count", { p_status });
  const total = Number(countData ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const currentPage = parsePage(pageParam, totalPages);
  const { from } = rangeFor(currentPage);

  const { data } = await supabase.rpc("get_admin_location_comments", {
    p_status,
    p_limit: ADMIN_PAGE_SIZE,
    p_offset: from,
  });
  const comments = (data ?? []) as CommentRow[];

  function hrefFor(page: number) {
    const params = new URLSearchParams();
    if (status !== "pending") params.set("status", status);
    params.set("page", String(page));
    return `/admin/comments?${params.toString()}`;
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Comments</h1>

      <div className="mb-6 flex gap-1">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={`/admin/comments?status=${tab.value}`}
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
            <TableHead>Rating</TableHead>
            <TableHead>Comment</TableHead>
            <TableHead>Author</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Submitted</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {comments.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <StarRatingDisplay rating={row.rating} />
              </TableCell>
              <TableCell className="max-w-xs">
                {row.comment ? (
                  <p className="line-clamp-3 text-sm">{row.comment}</p>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">{row.author_name}</TableCell>
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
                <Badge variant={STATUS_BADGE_VARIANT[row.status]}>{row.status}</Badge>
              </TableCell>
              <TableCell className="flex justify-end gap-2">
                {row.status === "pending" && (
                  <>
                    <form action={approveComment.bind(null, row.id)}>
                      <Button type="submit" variant="outline" size="sm">
                        Approve
                      </Button>
                    </form>
                    <form action={rejectComment.bind(null, row.id)}>
                      <Button type="submit" variant="outline" size="sm">
                        Reject
                      </Button>
                    </form>
                  </>
                )}
                {row.status === "approved" && (
                  <>
                    <form action={rejectComment.bind(null, row.id)}>
                      <Button type="submit" variant="outline" size="sm">
                        Reject
                      </Button>
                    </form>
                    <form action={deleteComment.bind(null, row.id)}>
                      <ConfirmSubmitButton
                        confirmMessage="Delete this comment permanently? This cannot be undone."
                        variant="destructive"
                        size="sm"
                      >
                        Delete
                      </ConfirmSubmitButton>
                    </form>
                  </>
                )}
                {row.status === "rejected" && (
                  <>
                    <form action={approveComment.bind(null, row.id)}>
                      <Button type="submit" variant="outline" size="sm">
                        Approve
                      </Button>
                    </form>
                    <form action={deleteComment.bind(null, row.id)}>
                      <ConfirmSubmitButton
                        confirmMessage="Delete this comment permanently? This cannot be undone."
                        variant="destructive"
                        size="sm"
                      >
                        Delete
                      </ConfirmSubmitButton>
                    </form>
                  </>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {comments.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">No {status === "all" ? "" : status} comments.</p>
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
