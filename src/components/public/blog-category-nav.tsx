import Link from "next/link";

type BlogCategoryOption = { id: string; name: string; slug: string };

/** "All" + one chip per active blog category, shared by /blog (no active
 * category) and /blog/category/[slug] (one active category) so both pages
 * link to the same clean `/blog/category/{slug}` URLs and highlight
 * consistently. */
export function BlogCategoryNav({
  categories,
  activeSlug,
}: {
  categories: BlogCategoryOption[];
  activeSlug?: string;
}) {
  if (categories.length === 0) return null;

  return (
    <nav aria-label="Blog categories" className="mt-6 flex flex-wrap gap-2">
      <Link
        href="/blog"
        className={`rounded-full border px-3 py-1 text-sm transition-colors ${!activeSlug ? "border-pb-brand bg-pb-brand text-white" : "hover:bg-muted"}`}
      >
        All
      </Link>
      {categories.map((category) => (
        <Link
          key={category.id}
          href={`/blog/category/${category.slug}`}
          className={`rounded-full border px-3 py-1 text-sm transition-colors ${activeSlug === category.slug ? "border-pb-brand bg-pb-brand text-white" : "hover:bg-muted"}`}
        >
          {category.name}
        </Link>
      ))}
    </nav>
  );
}
