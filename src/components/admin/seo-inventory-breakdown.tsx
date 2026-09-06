import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { isSeoEligible, seoEligibilityLabel } from "@/lib/seo-eligibility";

export type SeoBreakdownRow = {
  key: string;
  label: string;
  count: number;
  href?: string;
};

/** Compact published-location breakdown for an admin detail page — e.g. a
 * city's locations by category, or a category's locations by city. Every
 * label/count/badge comes from the caller (already scoped to
 * `is_published = true`); this component only renders it using the
 * centralized SEO eligibility rule, so the threshold is never duplicated
 * per admin surface. */
export function SeoInventoryBreakdown({
  title,
  rows,
  emptyText,
}: {
  title: string;
  rows: SeoBreakdownRow[];
  emptyText: string;
}) {
  return (
    <div className="mt-8 max-w-lg border-t pt-6">
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => {
            const label = row.href ? (
              <Link href={row.href} className="truncate hover:underline">
                {row.label}
              </Link>
            ) : (
              <span className="truncate">{row.label}</span>
            );
            return (
              <li key={row.key} className="flex items-center justify-between gap-3 text-sm">
                {label}
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-muted-foreground">
                    {row.count} location{row.count === 1 ? "" : "s"}
                  </span>
                  <Badge variant={isSeoEligible(row.count) ? "default" : "secondary"}>
                    {seoEligibilityLabel(row.count)}
                  </Badge>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
