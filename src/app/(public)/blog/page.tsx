import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import {
  getActiveBlogCategories,
  getBlogPostsByCategorySlug,
  getFeaturedBlogPosts,
  getPublishedBlogPostsPage,
  BLOG_LIST_PAGE_SIZE,
  type PublicBlogPostCard,
} from "@/lib/public-data";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { DEFAULT_OG_IMAGE } from "@/lib/jsonld";

type Props = { searchParams: Promise<{ page?: string; category?: string }> };

// No cookies/session here, so this route is eligible for ISR — same 60s
// window as the underlying cached queries in public-data.ts.
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const title = "Blog | PhotoBlinks";
  const description =
    "Guides, location spotlights, and photoshoot planning tips for pre-wedding shoots across Karnataka, Kerala, and beyond.";

  return {
    title,
    description,
    alternates: { canonical: "/blog" },
    openGraph: {
      title,
      description,
      url: "/blog",
      siteName: "PhotoBlinks",
      type: "website",
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

function formatPostDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function BlogPostCard({ post }: { post: PublicBlogPostCard }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-video w-full bg-muted">
        {post.featuredImageUrl && (
          <Image
            src={post.featuredImageUrl}
            alt={post.featuredImageAlt || post.title}
            fill
            className="object-cover"
          />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        {post.category && <span className="text-xs font-semibold uppercase tracking-wide text-pb-brand">{post.category.name}</span>}
        <h3 className="font-heading text-lg font-semibold">{post.title}</h3>
        {post.excerpt && <p className="line-clamp-3 text-sm text-muted-foreground">{post.excerpt}</p>}
        <span className="mt-auto pt-2 text-xs text-muted-foreground">{formatPostDate(post.publishedAt)}</span>
      </div>
    </Link>
  );
}

export default async function BlogIndexPage({ searchParams }: Props) {
  const { page: pageParam, category: categorySlug } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const categories = await getActiveBlogCategories();
  const activeCategory = categorySlug ? categories.find((c) => c.slug === categorySlug) : undefined;

  const [featuredPosts, listing] = await Promise.all([
    !categorySlug ? getFeaturedBlogPosts(3) : Promise.resolve([]),
    categorySlug && activeCategory
      ? getBlogPostsByCategorySlug(activeCategory.slug).then((posts) => ({ posts, total: posts.length }))
      : getPublishedBlogPostsPage(page),
  ]);

  const totalPages = categorySlug ? 1 : Math.max(1, Math.ceil(listing.total / BLOG_LIST_PAGE_SIZE));
  const breadcrumbItems = [
    { name: "Home", path: "/" },
    { name: "Blog", path: "/blog" },
    ...(activeCategory ? [{ name: activeCategory.name, path: `/blog?category=${activeCategory.slug}` }] : []),
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={breadcrumbItems} />

      <h1 className="font-heading text-3xl font-semibold sm:text-4xl">
        {activeCategory ? `${activeCategory.name} Articles` : "PhotoBlinks Blog"}
      </h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Location spotlights, photoshoot planning guides, and inspiration for pre-wedding shoots.
      </p>

      {categories.length > 0 && (
        <nav aria-label="Blog categories" className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/blog"
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${!activeCategory ? "border-pb-brand bg-pb-brand text-white" : "hover:bg-muted"}`}
          >
            All
          </Link>
          {categories.map((category) => (
            <Link
              key={category.id}
              href={`/blog?category=${category.slug}`}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${activeCategory?.slug === category.slug ? "border-pb-brand bg-pb-brand text-white" : "hover:bg-muted"}`}
            >
              {category.name}
            </Link>
          ))}
        </nav>
      )}

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
        <h2 className="font-heading mb-4 text-xl font-semibold">{activeCategory ? "Articles" : "Recent Articles"}</h2>
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

      {!activeCategory && totalPages > 1 && (
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
