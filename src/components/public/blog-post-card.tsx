import Link from "next/link";
import Image from "next/image";
import type { PublicBlogPostCard } from "@/lib/public-data";

export function formatPostDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function BlogPostCard({ post }: { post: PublicBlogPostCard }) {
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
