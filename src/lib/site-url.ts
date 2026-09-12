/** Single source of truth for the site's canonical absolute origin, used by
 * JSON-LD, sitemap.xml, robots.txt, and metadataBase.
 *
 * In a real production build/start (`NODE_ENV === "production"`, i.e. the
 * actual deployed app — not `npm run dev`), a missing or localhost/non-https
 * NEXT_PUBLIC_SITE_URL throws at module load instead of silently emitting
 * localhost/HTTP URLs into structured data, the sitemap, or robots.txt.
 * Local development is unaffected and keeps the localhost fallback. */
function resolveSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;

  if (process.env.NODE_ENV !== "production") {
    return raw ?? "http://localhost:3000";
  }

  if (!raw) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL is not set in production — refusing to generate localhost/relative canonical URLs, sitemap, robots.txt, or JSON-LD.",
    );
  }
  if (!raw.startsWith("https://") || raw.includes("localhost")) {
    throw new Error(
      `NEXT_PUBLIC_SITE_URL is set to "${raw}" in production — it must be an absolute https:// URL and must not be localhost.`,
    );
  }
  return raw;
}

export const SITE_URL = resolveSiteUrl();
