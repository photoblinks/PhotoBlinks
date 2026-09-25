import Link from "next/link";
import Image from "next/image";
import { ChevronDown } from "lucide-react";
import type { BlogBlock } from "@/lib/blog/content-blocks";
import { isInternalCtaPath } from "@/lib/blog/content-blocks";
import { isAllowedR2ImageUrl } from "@/lib/r2/upload";
import { LocationInfoTable } from "@/components/public/location-info-table";
import type { LocationInfoTableConfig } from "@/lib/location-info-fields";
import type { PublicLocationInfoEntry } from "@/lib/public-data";

type LocationLink = { id: string; name: string; slug: string };

/**
 * Renders the validated blog_posts.content block array as plain React
 * elements — every text field goes through normal JSX child interpolation
 * (React-escaped), never dangerouslySetInnerHTML. Blocks arrive already
 * validated by getPublishedBlogPostBySlug (blogContentSchema.safeParse), but
 * every block-type-specific security rule is re-checked here too:
 *   - image: url re-verified against the R2 host allowlist before Image sees it
 *   - locationLink: id resolved only against `locationLinks` — the caller
 *     builds that list from getPublicLocationLinksByIds, which itself only
 *     ever returns published locations, so an id for a deleted or
 *     unpublished location simply isn't in the map and the block renders
 *     nothing rather than a broken/dangerous link
 *   - cta: url re-verified with isInternalCtaPath before Link sees it
 * An individual block that fails its own re-check is skipped — it never
 * takes down the rest of the article.
 */
export function BlogContentRenderer({
  blocks,
  locationLinks,
  locationInfo,
  infoTableConfig,
}: {
  blocks: BlogBlock[];
  locationLinks: LocationLink[];
  locationInfo?: Map<string, PublicLocationInfoEntry>;
  infoTableConfig?: LocationInfoTableConfig | null;
}) {
  const locationById = new Map(locationLinks.map((l) => [l.id, l]));

  return (
    <div className="flex flex-col gap-6">
      {blocks.map((block, index) => (
        <BlogBlockView
          key={index}
          block={block}
          locationById={locationById}
          locationInfo={locationInfo}
          infoTableConfig={infoTableConfig ?? {}}
        />
      ))}
    </div>
  );
}

function BlogBlockView({
  block,
  locationById,
  locationInfo,
  infoTableConfig,
}: {
  block: BlogBlock;
  locationById: Map<string, LocationLink>;
  locationInfo?: Map<string, PublicLocationInfoEntry>;
  infoTableConfig: LocationInfoTableConfig;
}) {
  switch (block.type) {
    case "heading": {
      const text = block.text;
      return block.level === 2 ? (
        <h2 className="font-heading text-2xl font-semibold">{text}</h2>
      ) : (
        <h3 className="font-heading text-xl font-semibold">{text}</h3>
      );
    }

    case "paragraph":
      return <p className="leading-relaxed text-foreground/90">{block.text}</p>;

    case "list":
      return block.style === "ordered" ? (
        <ol className="list-decimal space-y-1 pl-6 leading-relaxed text-foreground/90">
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      ) : (
        <ul className="list-disc space-y-1 pl-6 leading-relaxed text-foreground/90">
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );

    case "quote":
      return (
        <blockquote className="border-l-4 border-pb-brand/40 pl-4 italic text-foreground/80">
          <p>{block.text}</p>
          {block.attribution && <cite className="mt-1 block text-sm not-italic text-muted-foreground">— {block.attribution}</cite>}
        </blockquote>
      );

    case "image": {
      if (!isAllowedR2ImageUrl(block.url)) return null;
      return (
        <figure>
          <div className="relative aspect-video w-full overflow-hidden rounded-xl border bg-muted">
            <Image src={block.url} alt={block.alt} fill className="object-cover" />
          </div>
          {block.caption && (
            <figcaption className="mt-2 text-center text-sm text-muted-foreground">{block.caption}</figcaption>
          )}
        </figure>
      );
    }

    case "faq":
      return (
        <details className="group rounded-xl border bg-white p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium marker:content-none">
            {block.question}
            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{block.answer}</p>
        </details>
      );

    case "locationLink": {
      const location = locationById.get(block.locationId);
      if (!location) return null;
      return (
        <Link
          href={`/location/${location.slug}`}
          className="flex items-center justify-between gap-3 rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <span className="font-medium">{block.label || location.name}</span>
          <span className="text-sm text-pb-brand">View location →</span>
        </Link>
      );
    }

    case "locationInfoTable": {
      // Only rendered when the caller resolved location info (editorial
      // pages always do); otherwise the block is skipped rather than
      // rendering broken/empty data.
      if (!locationInfo) return null;
      const locations = block.locationIds
        .map((id) => locationInfo.get(id))
        .filter((location): location is PublicLocationInfoEntry => location !== undefined);
      return <LocationInfoTable title={block.title} locations={locations} config={infoTableConfig} />;
    }

    case "cta": {
      if (!isInternalCtaPath(block.url)) return null;
      return (
        <Link
          href={block.url}
          className="inline-flex w-fit items-center justify-center rounded-full bg-pb-brand px-6 py-3 font-medium text-white transition-colors hover:bg-pb-brand/90"
        >
          {block.label}
        </Link>
      );
    }

    case "gallery": {
      const images = block.images.filter((img) => isAllowedR2ImageUrl(img.url));
      if (images.length === 0) return null;
      return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((img, i) => (
            <figure key={i}>
              <div className="relative aspect-square w-full overflow-hidden rounded-lg border bg-muted">
                <Image src={img.url} alt={img.alt} fill className="object-cover" />
              </div>
              {img.caption && <figcaption className="mt-1 text-center text-xs text-muted-foreground">{img.caption}</figcaption>}
            </figure>
          ))}
        </div>
      );
    }

    case "divider":
      return <hr className="border-t border-border" />;

    case "spacer": {
      const height = block.size === "sm" ? "h-4" : block.size === "lg" ? "h-16" : "h-8";
      return <div className={height} aria-hidden="true" />;
    }

    default: {
      // Exhaustiveness guard: if a new block type is ever added to
      // BlogBlock without updating this switch, this branch fails to
      // compile (block would not be `never`) rather than silently
      // rendering nothing at runtime for a known type.
      const _exhaustive: never = block;
      void _exhaustive;
      return null;
    }
  }
}
