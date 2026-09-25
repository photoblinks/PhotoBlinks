// Client-side block shapes for the Gutenberg-style editor. These mirror
// src/lib/blog/content-blocks.ts exactly (minus the client-only `id` used
// for React keys/drag-reorder/selection) — the hidden `content_json` input
// submits blocks with `id` stripped, and the server re-validates every
// field with the same Zod schema. This file only needs to produce
// well-shaped JSON; it never enforces the security/content rules itself.

type BlockBase = { id: string };

export type HeadingBlock = BlockBase & { type: "heading"; level: 2 | 3; text: string };
export type ParagraphBlock = BlockBase & { type: "paragraph"; text: string };
export type ListBlock = BlockBase & { type: "list"; style: "ordered" | "unordered"; items: string[] };
export type QuoteBlock = BlockBase & { type: "quote"; text: string; attribution: string };
export type ImageBlockT = BlockBase & { type: "image"; url: string; alt: string; caption: string };
export type GalleryImage = { url: string; alt: string; caption: string };
export type GalleryBlockT = BlockBase & { type: "gallery"; images: GalleryImage[] };
export type FaqBlockT = BlockBase & { type: "faq"; question: string; answer: string };
export type LocationLinkBlock = BlockBase & { type: "locationLink"; locationId: string; label: string };
export type LocationInfoTableBlock = BlockBase & { type: "locationInfoTable"; locationIds: string[]; title: string };
export type CtaBlock = BlockBase & { type: "cta"; label: string; url: string };
export type DividerBlock = BlockBase & { type: "divider" };
export type SpacerBlock = BlockBase & { type: "spacer"; size: "sm" | "md" | "lg" };

export type Block =
  | HeadingBlock
  | ParagraphBlock
  | ListBlock
  | QuoteBlock
  | ImageBlockT
  | GalleryBlockT
  | FaqBlockT
  | LocationLinkBlock
  | LocationInfoTableBlock
  | CtaBlock
  | DividerBlock
  | SpacerBlock;

export type BlogBlockInput =
  | Omit<HeadingBlock, "id">
  | Omit<ParagraphBlock, "id">
  | Omit<ListBlock, "id">
  | Omit<QuoteBlock, "id">
  | Omit<ImageBlockT, "id">
  | Omit<GalleryBlockT, "id">
  | Omit<FaqBlockT, "id">
  | Omit<LocationLinkBlock, "id">
  | Omit<LocationInfoTableBlock, "id">
  | Omit<CtaBlock, "id">
  | Omit<DividerBlock, "id">
  | Omit<SpacerBlock, "id">;

/** Inserter-facing block types — "heading2"/"heading3" are a UX convenience
 * (pick the level up front) that both map onto the single stored "heading"
 * block type with a `level` field. */
export type BlockType =
  | "paragraph"
  | "heading2"
  | "heading3"
  | "list"
  | "quote"
  | "image"
  | "gallery"
  | "faq"
  | "locationLink"
  | "locationInfoTable"
  | "cta"
  | "divider"
  | "spacer";

/** Canonical block types available in the normal blog post editor. Excludes
 * locationInfoTable, which is exclusive to Hybrid Editorial content
 * because blog post rendering does not resolve locationInfo. */
export const BLOG_POST_BLOCK_TYPES: readonly BlockType[] = [
  "paragraph",
  "heading2",
  "heading3",
  "list",
  "quote",
  "image",
  "gallery",
  "faq",
  "locationLink",
  "cta",
  "divider",
  "spacer",
];

export function makeBlock(type: BlockType): Block {
  const id = crypto.randomUUID();
  switch (type) {
    case "paragraph":
      return { id, type: "paragraph", text: "" };
    case "heading2":
      return { id, type: "heading", level: 2, text: "" };
    case "heading3":
      return { id, type: "heading", level: 3, text: "" };
    case "list":
      return { id, type: "list", style: "unordered", items: [""] };
    case "quote":
      return { id, type: "quote", text: "", attribution: "" };
    case "image":
      return { id, type: "image", url: "", alt: "", caption: "" };
    case "gallery":
      return { id, type: "gallery", images: [] };
    case "faq":
      return { id, type: "faq", question: "", answer: "" };
    case "locationLink":
      return { id, type: "locationLink", locationId: "", label: "" };
    case "locationInfoTable":
      return { id, type: "locationInfoTable", locationIds: [], title: "" };
    case "cta":
      return { id, type: "cta", label: "", url: "" };
    case "divider":
      return { id, type: "divider" };
    case "spacer":
      return { id, type: "spacer", size: "md" };
  }
}

export function toSubmittable(block: Block): BlogBlockInput {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- client-generated id is dropped from the payload
  const { id: _id, ...rest } = block;
  return rest;
}

export function blockLabel(block: Block): string {
  if (block.type === "heading") return `Heading (H${block.level})`;
  if (block.type === "locationLink") return "Location";
  if (block.type === "locationInfoTable") return "Location Information Table";
  if (block.type === "cta") return "Call to Action";
  if (block.type === "faq") return "FAQ";
  return block.type.charAt(0).toUpperCase() + block.type.slice(1);
}
