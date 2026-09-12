import type { PublicBlogPostDetail } from "@/lib/public-data";
import { buildBlogPostingJsonLd } from "@/lib/jsonld";
import { JsonLd } from "./json-ld";
import type { BreadcrumbItem } from "./breadcrumbs";

/** Combined BlogPosting + BreadcrumbList (+ FAQPage when present) structured
 * data for a blog article page, rendered as one JSON-LD script with an
 * @graph. Takes the already-loaded post and already-computed breadcrumb
 * trail — it never fetches anything itself. */
export function BlogPostingJsonLd({
  post,
  breadcrumbItems,
}: {
  post: PublicBlogPostDetail;
  breadcrumbItems: BreadcrumbItem[];
}) {
  return <JsonLd data={buildBlogPostingJsonLd(post, breadcrumbItems)} />;
}
