import Link from "next/link";

export type BreadcrumbItem = { name: string; path: string };

/** Visual breadcrumb trail. The last item is rendered as the current page
 * (no link). Structured data is emitted by each page's own JSON-LD graph
 * (see buildPageJsonLd / the detail-page builders in lib/jsonld.ts). */
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 hidden text-sm text-muted-foreground sm:block">
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
    </>
  );
}
