import { getActiveBlogCategories, getPublishedBlogPostsPage, getFeaturedBlogPosts, BLOG_LIST_PAGE_SIZE } from "@/lib/public-data";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { BlogCategoryNav } from "@/components/public/blog-category-nav";
import { BlogPostCard } from "@/components/public/blog-post-card";
import { DEFAULT_OG_IMAGE } from "@/lib/jsonld";
import Link from "next/link";
import type { Metadata } from "next";

type Props = { searchParams: Promise<{ page?: string }> };

// No cookies/session here, so this route is eligible for ISR — same 60s
// window as the underlying cached queries in public-data.ts.
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  // Plain title (no manual brand suffix) so the root layout's title template
  // ("%s | PhotoBlinks", see src/app/layout.tsx) appends it exactly once —
  // a manual "| PhotoBlinks" here on top of the template used to render as
  // "Blog | PhotoBlinks | PhotoBlinks". Open Graph titles aren't run through
  // that template, so the brand suffix there is added explicitly to keep
  // the OG title unchanged from before this fix.
  const title = "Blog";
  const description =
    "Guides, location spotlights, and photoshoot planning tips for pre-wedding shoots across Karnataka, Kerala, and beyond.";

  return {
    title,
    description,
    alternates: { canonical: "/blog" },
    openGraph: {
      title: `${title} | PhotoBlinks`,
      description,
      url: "/blog",
      siteName: "PhotoBlinks",
      type: "website",
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

export default async function BlogIndexPage({ searchParams }: Props) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const [categories, featuredPosts, listing] = await Promise.all([
    getActiveBlogCategories(),
    getFeaturedBlogPosts(3),
    getPublishedBlogPostsPage(page),
  ]);

  const totalPages = Math.max(1, Math.ceil(listing.total / BLOG_LIST_PAGE_SIZE));
  const breadcrumbItems = [
    { name: "Home", path: "/" },
    { name: "Blog", path: "/blog" },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={breadcrumbItems} />

      <h1 className="font-heading text-3xl font-semibold sm:text-4xl">PhotoBlinks Blog</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Location spotlights, photoshoot planning guides, and inspiration for pre-wedding shoots.
      </p>

      <BlogCategoryNav categories={categories} />

      {featuredPosts.length > 0 && (
        <section className="mt-10">
          <h2 className="font-heading mb-4 text-xl font-semibold">Featured</h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featuredPosts.map((post) => (
              <BlogPostCard key={post.id} post={post} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="font-heading mb-4 text-xl font-semibold">Recent Articles</h2>
        {listing.posts.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {listing.posts.map((post) => (
              <BlogPostCard key={post.id} post={post} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No articles published yet.</p>
        )}
      </section>

      {totalPages > 1 && (
        <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-4">
          {page > 1 && (
            <Link href={page - 1 === 1 ? "/blog" : `/blog?page=${page - 1}`} className="text-sm font-medium text-pb-brand hover:underline">
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
    </div>
  );
}
