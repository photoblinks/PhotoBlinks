"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BlogPostCard } from "@/components/public/blog-post-card";
import type { PublicBlogPostCard } from "@/lib/public-data";

// Mirrors BLOG_LIST_PAGE_SIZE in public-data.ts (a server-only module, so
// the value is inlined here rather than imported at runtime).
const PAGE_SIZE = 12;

/** Pure "Recent Articles" section + Newer/Older pagination nav — used by the
 * server page as the Suspense fallback and by BlogListing below. */
export function BlogListingSection({
  posts,
  page,
  totalPages,
}: {
  posts: PublicBlogPostCard[];
  page: number;
  totalPages: number;
}) {
  return (
    <section className="mt-10">
      <h2 className="font-heading mb-4 text-xl font-semibold">Recent Articles</h2>
      {posts.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <BlogPostCard key={post.id} post={post} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No articles published yet.</p>
      )}

      {totalPages > 1 && (
        <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-4">
          {page > 1 && (
            <Link
              href={page - 1 === 1 ? "/blog" : `/blog?page=${page - 1}`}
              className="text-sm font-medium text-pb-brand hover:underline"
            >
              ← Newer
            </Link>
          )}
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link href={`/blog?page=${page + 1}`} className="text-sm font-medium text-pb-brand hover:underline">
              Older →
            </Link>
          )}
        </nav>
      )}
    </section>
  );
}

/** Client-side pagination for /blog — reads `?page=` and slices the full
 * published-post list already fetched by the static server page. */
export function BlogListing({ posts }: { posts: PublicBlogPostCard[] }) {
  const searchParams = useSearchParams();
  const pageParam = searchParams.get("page");
  const page = Math.max(1, Number(pageParam) || 1);
  const totalPages = Math.max(1, Math.ceil(posts.length / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const pagePosts = posts.slice(start, start + PAGE_SIZE);

  return <BlogListingSection posts={pagePosts} page={page} totalPages={totalPages} />;
}
