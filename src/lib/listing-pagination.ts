import { parsePage } from "@/lib/admin/pagination";

/** Public location listings render at most this many cards per page, so no
 * single response carries the whole published dataset. */
export const LISTING_PAGE_SIZE = 36;

export function listingTotalPages(total: number): number {
  return Math.max(1, Math.ceil(total / LISTING_PAGE_SIZE));
}

/** Slices an already-fetched (server-side, cached) location list to one page.
 * An invalid or out-of-range `?page=` clamps to the nearest valid page. */
export function paginateListing<T>(items: T[], pageParam?: string) {
  const totalPages = listingTotalPages(items.length);
  const page = parsePage(pageParam, totalPages);
  const start = (page - 1) * LISTING_PAGE_SIZE;
  return { items: items.slice(start, start + LISTING_PAGE_SIZE), page, totalPages, total: items.length };
}

/** Self-referencing canonical for page 2+; page 1 keeps the clean URL. */
export function pagedPath(path: string, pageParam: string | undefined, total: number): string {
  const page = parsePage(pageParam, listingTotalPages(total));
  return page > 1 ? `${path}?page=${page}` : path;
}
