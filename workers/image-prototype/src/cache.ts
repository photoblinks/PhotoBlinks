import { VERSION } from "./config";

/**
 * Deterministic cache key that includes every parameter affecting the output.
 * Format is folded into the key (no `Vary: Accept`), so distinct
 * width/format/quality/key combinations can never collide in the edge cache.
 * Key segments are percent-encoded so a literal "%" in a key cannot alias
 * another key after URL normalization.
 */
export function cacheKey(width: number, format: string, quality: number, objectKey: string): string {
  return `https://image-prototype.local/__transform/${VERSION}/${width}/${format}/${quality}/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Returns the Workers Cache API default cache when available.
 * It is absent in Node (unit tests) and when running outside the Workers
 * runtime; callers must treat `undefined` as "caching unavailable" rather
 * than fail. Under `wrangler dev` and production the real cache is present.
 */
export function getCache(): Cache | undefined {
  const g = globalThis as unknown as { caches?: { default?: Cache } };
  return g.caches?.default;
}
