import Link from "next/link";
import { JsonLd } from "@/components/public/json-ld";
import { buildBreadcrumbList } from "@/lib/jsonld";

export type BreadcrumbItem = { name: string; path: string };

/** Visual breadcrumb trail plus matching BreadcrumbList JSON-LD. The last
 * item is rendered as the current page (no link). */
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-1.5">
          {items.map((item, index) => {
            const isLast = index === items.length - 1;
            return (
              <li key={item.path} className="flex items-center gap-1.5">
                {index > 0 && (
                  <span aria-hidden="true" className="text-border">
                    ›
                  </span>
                )}
                {isLast ? (
                  <span aria-current="page" className="text-foreground">
                    {item.name}
                  </span>
                ) : (
                  <Link href={item.path} className="hover:text-foreground hover:underline">
                    {item.name}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <JsonLd data={buildBreadcrumbList(items)} />
    </>
  );
}
