import Link from "next/link";
import { Button } from "@/components/ui/button";

type Props = {
  /** Base path plus any existing query params, without `page` — e.g. the
   * result of building a URLSearchParams from the current filters. */
  hrefFor: (page: number) => string;
  currentPage: number;
  totalPages: number;
  total: number;
  pageSize: number;
};

/** Server-compatible pagination footer for admin list pages. Pure links —
 * no client state — so it works with SSR, browser back/forward, and Next.js
 * server rendering. Mirrors the pagination footer already used on the SEO
 * inventory pages (location-categories, location-state-categories). */
export function AdminPagination({ hrefFor, currentPage, totalPages, total, pageSize }: Props) {
  if (total === 0) return null;

  const from = (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, total);

  return (
    <div className="mt-4 flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        Showing {from}–{to} of {total} · Page {currentPage} of {totalPages}
      </p>
      <div className="flex gap-2">
        <Button
          render={<Link href={hrefFor(currentPage - 1)} />}
          variant="outline"
          size="sm"
          disabled={currentPage <= 1}
        >
          Previous
        </Button>
        <Button
          render={<Link href={hrefFor(currentPage + 1)} />}
          variant="outline"
          size="sm"
          disabled={currentPage >= totalPages}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
