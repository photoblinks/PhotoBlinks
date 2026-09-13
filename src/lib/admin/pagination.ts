export const ADMIN_PAGE_SIZE = 20;

/** Parses a 1-based page number from a raw query-string value. Falls back to
 * 1 for missing/invalid/non-integer/<1 values, and clamps to `totalPages`
 * when supplied (e.g. after a filter shrinks the result set). */
export function parsePage(pageParam?: string, totalPages?: number): number {
  const parsed = Number(pageParam);
  const page = Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
  if (totalPages !== undefined) return Math.min(page, Math.max(1, totalPages));
  return page;
}

/** Converts a 1-based page number into a zero-based inclusive range, for use
 * with Supabase's `.range(from, to)`. */
export function rangeFor(page: number, size: number = ADMIN_PAGE_SIZE): { from: number; to: number } {
  const from = (page - 1) * size;
  const to = from + size - 1;
  return { from, to };
}
