import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getActiveBlogCategories, getBlogCategoryBySlug, getBlogPostsByCategorySlug } from "@/lib/public-data";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { BlogCategoryNav } from "@/components/public/blog-category-nav";
import { BlogPostCard } from "@/components/public/blog-post-card";
import { DEFAULT_OG_IMAGE } from "@/lib/jsonld";

type Props = { params: Promise<{ slug: string }> };

// Same ISR pattern as /blog and /blog/[slug] — no cookies/searchParams, so
// this route is eligible for the Full Route Cache with a 60s revalidate
// window matching the underlying public-data.ts queries. Must be a literal
// here — Next statically analyzes this segment config export at build time.
export const revalidate = 60;

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = await getBlogCategoryBySlug(slug);
  if (!category) return {};

  const title = `${category.name} Articles`;
  const description =
    category.description ||
    `Browse ${category.name.toLowerCase()} articles on the PhotoBlinks blog — guides, spotlights, and photoshoot planning tips.`;
  const path = `/blog/category/${category.slug}`;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: `${title} | PhotoBlinks`,
      description,
      url: path,
      siteName: "PhotoBlinks",
      type: "website",
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

export default async function BlogCategoryPage({ params }: Props) {
  const { slug } = await params;
  const category = await getBlogCategoryBySlug(slug);
  if (!category) notFound();

  const [categories, posts] = await Promise.all([
    getActiveBlogCategories(),
    getBlogPostsByCategorySlug(category.slug),
  ]);

  const breadcrumbItems = [
    { name: "Home", path: "/" },
    { name: "Blog", path: "/blog" },
    { name: category.name, path: `/blog/category/${category.slug}` },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={breadcrumbItems} />

      <h1 className="font-heading text-3xl font-semibold sm:text-4xl">{category.name} Articles</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        {category.description ||
          `Browse ${category.name.toLowerCase()} articles on the PhotoBlinks blog.`}
      </p>

      <BlogCategoryNav categories={categories} activeSlug={category.slug} />

      <section className="mt-10">
        <h2 className="font-heading mb-4 text-xl font-semibold">Articles</h2>
        {posts.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <BlogPostCard key={post.id} post={post} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No articles published in this category yet.</p>
        )}
      </section>
    </div>
  );
}
