/**
 * Phase 3 allowlists and limits.
 *
 * Every value here must be kept in sync with the application's documented
 * widths and the architecture doc (docs/image-pipeline/architecture.md §3).
 * The width allowlist is the primary defence against an unbounded
 * transformation surface (which is what exhausted the /cdn-cgi/image/ quota).
 */

/** Cache namespace version. Bump to invalidate every cached variant at once. */
export const VERSION = "v2"; // v2: real WASM transform (was passthrough in v1)

/** Fixed render widths used by the app. Anything else is rejected. */
export const ALLOWED_WIDTHS: ReadonlySet<number> = new Set([160, 400, 640, 800, 1200, 1920]);

/** Output formats. JPEG + WebP per the Phase 4 plan; the engine also supports
 * png/avif but those stay out of the allowlist until explicitly required. */
export const ALLOWED_OUTPUT_FORMATS: ReadonlySet<string> = new Set(["jpeg", "webp"]);

export const QUALITY_MIN = 40;
export const QUALITY_MAX = 90;

/** Mirrors the app's 10 MB admin upload cap (src/lib/r2/upload.ts). */
export const MAX_INPUT_BYTES = 10 * 1024 * 1024;

/**
 * Decoded-pixel cap. Compressed size says nothing about decoded size: a
 * 420 KB PNG can declare 12000x12000 (144 MP, ~576 MB as RGBA). 16 MP is
 * ~64 MB as RGBA, the largest figure that plausibly leaves room for the WASM
 * heap and output inside the documented 128 MB isolate limit. PROVISIONAL:
 * real peak memory is unmeasured; revisit after a deployed measurement.
 */
export const MAX_INPUT_PIXELS = 16_000_000;

/** Defensive output cap for the (future) encode step. */
export const MAX_OUTPUT_BYTES = 20 * 1024 * 1024;

export const MAX_KEY_LENGTH = 1024; // R2 object key limit (verified)

/** Object-key allowlist: only known prefixes and image extensions. */
export const KEY_PATTERN =
  /^(locations|studios|categories|countries|states|cities|site|photographers|blog)\/[a-z0-9._%+\-~\/]+\.(jpg|jpeg|png|webp)$/i;

export const OUTPUT_CONTENT_TYPES: Readonly<Record<string, string>> = {
  jpeg: "image/jpeg",
  webp: "image/webp",
};
