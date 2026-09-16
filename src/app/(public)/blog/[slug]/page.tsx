import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import {
  getPublishedBlogPostBySlug,
  getPublicLocationLinksByIds,
  getRelatedBlogPosts,
} from "@/lib/public-data";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { BlogPostingJsonLd } from "@/components/public/blog-posting-json-ld";
import { BlogContentRenderer } from "@/components/public/blog-content-renderer";
import { isAllowedR2ImageUrl } from "@/lib/r2/upload";

type Props = { params: Promise<{ slug: string }> };

// Same ISR pattern as /location/[slug] — no cookies/searchParams, so this
// route is eligible for the Full Route Cache with a 60s revalidate window
// matching the underlying public-data.ts queries.
export const revalidate = 60;

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedBlogPostBySlug(slug);
  if (!post) return {};

  // Plain fallback (no manual brand suffix) so the root layout's title
  // template ("%s | PhotoBlinks", see src/app/layout.tsx) appends it exactly
  // once — the old "${post.title} | PhotoBlinks Blog" fallback rendered as
  // "Article | PhotoBlinks Blog | PhotoBlinks" once the template ran. An
  // admin-supplied metaTitle still goes through the template unchanged, same
  // as it always has. Open Graph isn't templated, so its title is computed
  // separately to keep the OG title exactly what it rendered before this fix.
  const title = post.metaTitle || post.title;
  const ogTitle = post.metaTitle || `${post.title} | PhotoBlinks Blog`;
  const description = post.metaDescription || post.excerpt || post.title;
  // Only ever an R2-hosted image URL (validated at write time and again
  // here) ever reaches Open Graph — never an attacker-controlled host.
  const ogImage = post.featuredImageUrl && isAllowedR2ImageUrl(post.featuredImageUrl) ? post.featuredImageUrl : undefined;

  return {
    title,
    description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: ogTitle,
      description,
      url: `/blog/${post.slug}`,
      siteName: "PhotoBlinks",
      type: "article",
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      authors: [post.authorName],
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

function formatPostDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPublishedBlogPostBySlug(slug);
  if (!post) notFound();

  // Batch-resolve every locationLink block's id in one query, plus the
  // post's own related-locations list — never one query per block.
  const contentLocationIds = post.content
    .filter((block) => block.type === "locationLink")
    .map((block) => block.locationId);
  const allLocationIds = [...new Set([...contentLocationIds, ...post.locationIds])];

  const [locationLinks, relatedPosts] = await Promise.all([
    getPublicLocationLinksByIds(allLocationIds),
    getRelatedBlogPosts({
      postId: post.id,
      categorySlug: post.category?.slug ?? null,
      tagSlugs: post.tags.map((t) => t.slug),
      locationIds: post.locationIds,
    }),
  ]);

  const locationLinkById = new Map(locationLinks.map((l) => [l.id, l]));
  // post.locations already comes from an RLS-gated join (see
  // getPublishedBlogPostBySlug), but re-intersect with the freshly-fetched
  // published-only batch so a location unpublished between that join and
  // this render still can't produce a public card.
  const relatedLocations = post.locations.filter((l) => locationLinkById.has(l.id));

  const breadcrumbItems = [
    { name: "Home", path: "/" },
    { name: "Blog", path: "/blog" },
    ...(post.category ? [{ name: post.category.name, path: `/blog/category/${post.category.slug}` }] : []),
    { name: post.title, path: `/blog/${post.slug}` },
  ];

  const featuredImage = post.featuredImageUrl && isAllowedR2ImageUrl(post.featuredImageUrl) ? post.featuredImageUrl : null;

  return (
    <article className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={breadcrumbItems} includeJsonLd={false} />

      <header className="mb-6">
        {post.category && (
          <Link
            href={`/blog/category/${post.category.slug}`}
            className="text-xs font-semibold uppercase tracking-wide text-pb-brand hover:underline"
          >
            {post.category.name}
          </Link>
        )}
        <h1 className="font-heading mt-2 text-3xl font-semibold sm:text-4xl">{post.title}</h1>
        {post.excerpt && <p className="mt-3 text-lg text-muted-foreground">{post.excerpt}</p>}
        <p className="mt-4 text-sm text-muted-foreground">
          By {post.authorName} · {formatPostDate(post.publishedAt)}
        </p>
      </header>

      {featuredImage && (
        <div className="relative mb-8 aspect-video w-full overflow-hidden rounded-xl border bg-muted">
          <Image
            src={featuredImage}
            alt={post.featuredImageAlt || post.title}
            fill
            className="object-cover"
            priority
          />
        </div>
      )}

      <BlogContentRenderer blocks={post.content} locationLinks={locationLinks} />

      {relatedLocations.length > 0 && (
        <section className="mt-14 border-t pt-8">
          <h2 className="font-heading mb-4 text-xl font-semibold">Related Locations</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {relatedLocations.map((location) => (
              <Link
                key={location.id}
                href={`/location/${location.slug}`}
                className="flex items-center justify-between gap-3 rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <span className="font-medium">{location.name}</span>
                <span className="text-sm text-pb-brand">View location →</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {post.faqs.length > 0 && (
        <section className="mt-14 border-t pt-8">
          <h2 className="font-heading mb-4 text-xl font-semibold">Frequently Asked Questions</h2>
          <div className="flex flex-col divide-y overflow-hidden rounded-xl border bg-white shadow-sm">
            {post.faqs.map((faq, index) => (
              <details key={index} className="group p-4">
                <summary className="cursor-pointer list-none font-medium marker:content-none">{faq.question}</summary>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {relatedPosts.length > 0 && (
        <section className="mt-14 border-t pt-8">
          <h2 className="font-heading mb-4 text-xl font-semibold">Related Articles</h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {relatedPosts.map((related) => (
              <Link
                key={related.id}
                href={`/blog/${related.slug}`}
                className="flex flex-col gap-1 rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <span className="font-heading font-semibold">{related.title}</span>
                {related.excerpt && <span className="line-clamp-2 text-sm text-muted-foreground">{related.excerpt}</span>}
              </Link>
            ))}
          </div>
        </section>
      )}

      <BlogPostingJsonLd post={post} breadcrumbItems={breadcrumbItems} />
    </article>
  );
}
