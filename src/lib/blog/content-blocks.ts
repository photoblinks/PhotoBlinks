import { z } from "zod";
import { isAllowedR2ImageUrl } from "@/lib/r2/upload";

// Strict allowlist of block types for blog_posts.content. Any block shape
// outside this union — unknown type, extra fields, wrong field types — is
// rejected by blogContentSchema.parse(), never coerced or dropped silently.
// There is no rich-text/HTML block: every text field is plain string,
// rendered as text (never dangerouslySetInnerHTML) and rejected outright if
// it looks like a markup tag (see noHtml below).

const TAG_LIKE = /<\/?[a-z][\s\S]*>/i;

function noHtml(value: string) {
  return !TAG_LIKE.test(value);
}

const plainText = (max: number) =>
  z.string().trim().min(1).max(max).refine(noHtml, "HTML tags are not allowed.");

const optionalPlainText = (max: number) =>
  z.string().trim().max(max).refine(noHtml, "HTML tags are not allowed.").optional();

// CTA links stay internal-only: this phase adds no new external-link surface
// (no booking/marketplace/messaging per project scope), so a cta block may
// only point at a same-site relative path. A generic `^\/[chars]*$` charset
// is NOT enough — a leading "//" (e.g. "//evil.com") is a protocol-relative
// URL that browsers resolve to an external host despite starting with "/",
// and a bare `/[...]*` pattern lets any made-up path through even though it
// isn't a real page. Instead this allowlists the exact internal destination
// shapes that actually exist, so both attack classes are closed at once.
const INTERNAL_CTA_DESTINATIONS = [
  /^\/$/,
  /^\/locations$/,
  /^\/studios$/,
  /^\/blog$/,
  /^\/favourites$/,
  /^\/location\/[a-z0-9-]+$/,
  /^\/studio\/[a-z0-9-]+$/,
  /^\/category\/[a-z0-9-]+$/,
  /^\/blog\/[a-z0-9-]+$/,
];

/** Exported so the public renderer can re-check a cta block's url at render
 * time (defense in depth) without re-deriving the allowlist. */
export function isInternalCtaPath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && INTERNAL_CTA_DESTINATIONS.some((re) => re.test(value));
}

const internalPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .refine(isInternalCtaPath, "Must link to an existing PhotoBlinks page.");

const imageUrlSchema = z
  .string()
  .trim()
  .url()
  .refine(isAllowedR2ImageUrl, "Image must be hosted on the PhotoBlinks R2 bucket.");

const headingBlock = z
  .object({
    type: z.literal("heading"),
    level: z.union([z.literal(2), z.literal(3)]),
    text: plainText(200),
  })
  .strict();

const paragraphBlock = z
  .object({
    type: z.literal("paragraph"),
    text: plainText(5000),
  })
  .strict();

const listBlock = z
  .object({
    type: z.literal("list"),
    style: z.enum(["ordered", "unordered"]),
    items: z.array(plainText(300)).min(1).max(50),
  })
  .strict();

const quoteBlock = z
  .object({
    type: z.literal("quote"),
    text: plainText(2000),
    attribution: optionalPlainText(200),
  })
  .strict();

const imageBlock = z
  .object({
    type: z.literal("image"),
    url: imageUrlSchema,
    alt: plainText(300),
    caption: optionalPlainText(500),
  })
  .strict();

const faqBlock = z
  .object({
    type: z.literal("faq"),
    question: plainText(300),
    answer: plainText(2000),
  })
  .strict();

const locationLinkBlock = z
  .object({
    type: z.literal("locationLink"),
    locationId: z.string().uuid(),
    label: optionalPlainText(200),
  })
  .strict();

// References a list of canonical location ids rather than duplicating any
// location facts — the public renderer resolves each id against published
// locations and draws only the configured fields (see
// location-info-fields.ts). Bounded so a single block can't balloon into an
// unbounded payload.
const locationInfoTableBlock = z
  .object({
    type: z.literal("locationInfoTable"),
    locationIds: z.array(z.string().uuid()).min(1).max(50),
    title: optionalPlainText(200),
  })
  .strict();

const ctaBlock = z
  .object({
    type: z.literal("cta"),
    label: plainText(100),
    url: internalPathSchema,
  })
  .strict();

// --- Editor-direction-change additions (gallery/divider/spacer) -----------
// `blog_posts.content` is untyped JSONB with no CHECK constraint (see
// 20260911000000_blog_system.sql) — block-shape validation lives entirely
// here, at the application layer, not in the database. Adding a new block
// type is therefore a pure Zod-schema change with no migration: existing
// stored rows (built only from the original 8 types) remain valid content
// arrays under this still-growing discriminated union, and the public
// renderer only needs new `case` branches, never a backfill.

const galleryImageSchema = z
  .object({
    url: imageUrlSchema,
    alt: plainText(300),
    caption: optionalPlainText(500),
  })
  .strict();

const galleryBlock = z
  .object({
    type: z.literal("gallery"),
    images: z.array(galleryImageSchema).min(1).max(20),
  })
  .strict();

const dividerBlock = z
  .object({
    type: z.literal("divider"),
  })
  .strict();

const spacerBlock = z
  .object({
    type: z.literal("spacer"),
    size: z.enum(["sm", "md", "lg"]),
  })
  .strict();

export const blogBlockSchema = z.discriminatedUnion("type", [
  headingBlock,
  paragraphBlock,
  listBlock,
  quoteBlock,
  imageBlock,
  faqBlock,
  locationLinkBlock,
  locationInfoTableBlock,
  ctaBlock,
  galleryBlock,
  dividerBlock,
  spacerBlock,
]);

export type BlogBlock = z.infer<typeof blogBlockSchema>;

// Bounded so a single post can't be turned into an unbounded payload.
export const blogContentSchema = z.array(blogBlockSchema).max(200);

/** Parses a JSON string (as submitted by the content block editor's hidden
 * input) into a validated block array. Throws a ZodError on anything
 * malformed — caller is expected to catch it the same way other admin forms
 * catch z.ZodError. */
export function parseBlogContent(raw: string): BlogBlock[] {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("Content is not valid JSON.");
  }
  return blogContentSchema.parse(json);
}

// --- Editorial content (State / State + Category pages) --------------------
// Editorial content is the blog block model WITHOUT image/gallery blocks —
// editorial images are not part of this feature, and the R2 blog namespace
// is not reused for editorial uploads. Every other block (including the new
// locationInfoTable) is shared with the blog, so the public renderer and
// editor are reused unchanged. Rejected content fails the whole parse —
// never coerced or dropped silently.

export const editorialBlockSchema = z.discriminatedUnion("type", [
  headingBlock,
  paragraphBlock,
  listBlock,
  quoteBlock,
  faqBlock,
  locationLinkBlock,
  locationInfoTableBlock,
  ctaBlock,
  dividerBlock,
  spacerBlock,
]);

export type EditorialBlock = z.infer<typeof editorialBlockSchema>;

export const editorialContentSchema = z.array(editorialBlockSchema).max(200);

/** Parses a JSON string (as submitted by the content block editor's hidden
 * input) into a validated editorial block array. Throws a ZodError on
 * anything malformed — caller is expected to catch it the same way other
 * admin forms catch z.ZodError. */
export function parseEditorialContent(raw: string): EditorialBlock[] {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("Content is not valid JSON.");
  }
  return editorialContentSchema.parse(json);
}

/** Per-block fail-closed validation of an already-parsed (JSONB) content
 * value. Each block is validated individually against editorialBlockSchema;
 * invalid blocks are dropped and a non-array value yields an empty array.
 * Used by the public read path (public-data.ts) and the admin editor when
 * hydrating stored content. */
export function parseEditorialBlocks(value: unknown): EditorialBlock[] {
  if (!Array.isArray(value)) return [];
  const blocks: EditorialBlock[] = [];
  for (const block of value) {
    if (blocks.length >= 200) break;
    const parsed = editorialBlockSchema.safeParse(block);
    if (parsed.success) blocks.push(parsed.data);
  }
  return blocks;
}
