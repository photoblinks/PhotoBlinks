import { Suspense } from "react";
import {
  getActiveBlogCategories,
  getFeaturedBlogPosts,
  getPublishedBlogPosts,
  BLOG_LIST_PAGE_SIZE,
} from "@/lib/public-data";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { BlogCategoryNav } from "@/components/public/blog-category-nav";
import { BlogPostCard } from "@/components/public/blog-post-card";
import { BlogListing, BlogListingSection } from "@/components/public/blog-listing";
import { DEFAULT_OG_IMAGE } from "@/lib/jsonld";
import type { Metadata } from "next";

// ISR: no cookies/searchParams read, so this route is eligible for the Full
// Route Cache with a 60s revalidate window matching public-data.ts.
// Pagination now runs client-side (BlogListing) against the full published
// post list, so ?page=N no longer forces a dynamic render.
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
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

export default async function BlogIndexPage() {
  const [categories, featuredPosts, allPosts] = await Promise.all([
    getActiveBlogCategories(),
    getFeaturedBlogPosts(3),
    getPublishedBlogPosts(),
  ]);

  const totalPages = Math.max(1, Math.ceil(allPosts.length / BLOG_LIST_PAGE_SIZE));
  const pageOnePosts = allPosts.slice(0, BLOG_LIST_PAGE_SIZE);
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

      <Suspense fallback={<BlogListingSection posts={pageOnePosts} page={1} totalPages={totalPages} />}>
        <BlogListing posts={allPosts} />
      </Suspense>
    </div>
  );
}
