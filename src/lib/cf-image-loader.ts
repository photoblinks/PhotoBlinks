/**
 * Custom next/image loader (next.config.ts: images.loader = "custom").
 * Rewrites every R2-hosted image request into a Cloudflare Image
 * Transformations URL served from the R2 custom domain, instead of
 * routing through Vercel's own image-optimization endpoint (/_next/image).
 *
 * Existing stored URLs (locations/studios/categories/etc. all point at the
 * R2 public-dev host, e.g. https://pub-xxxx.r2.dev/locations/foo.webp) are
 * left completely untouched in the database — only the URL next/image
 * requests at render time is rewritten, and the object path (everything
 * after the host) is carried over byte-for-byte so it still resolves to
 * the exact same R2 object through the connected custom domain.
 */

type ImageLoaderProps = { src: string; width: number; quality?: number };

// Public, non-secret — safe to inline into the client bundle (this loader
// runs in both server and client renders). Overridable via env without a
// code change if the custom domain ever changes.
const CF_IMAGE_DOMAIN = process.env.NEXT_PUBLIC_R2_IMAGE_DOMAIN || "images.photoblinks.com";

// Fixed, non-randomized default so repeated requests for the same image at
// the same width reuse the same Cloudflare transformation variant instead
// of burning the Free plan's 5,000/month unique-transformation quota.
const DEFAULT_QUALITY = 75;

const R2_DEV_HOSTNAME_SUFFIX = ".r2.dev";
const CDN_CGI_IMAGE_PREFIX = "/cdn-cgi/image/";

export default function cfImageLoader({ src, width, quality }: ImageLoaderProps): string {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    // Not an absolute URL (shouldn't happen for R2-hosted images) — return
    // untouched rather than guessing, so the <img> still gets a usable src.
    return src;
  }

  const isKnownR2Host = url.hostname.endsWith(R2_DEV_HOSTNAME_SUFFIX) || url.hostname === CF_IMAGE_DOMAIN;
  if (!isKnownR2Host) return src;

  // Already a transform URL (e.g. a stored src somehow already went
  // through this loader) — don't wrap it a second time.
  if (url.pathname.startsWith(CDN_CGI_IMAGE_PREFIX)) return src;

  const objectPath = url.pathname; // e.g. "/locations/example-slug/photo.webp"
  const resolvedQuality = quality ?? DEFAULT_QUALITY;

  return `https://${CF_IMAGE_DOMAIN}${CDN_CGI_IMAGE_PREFIX}width=${width},quality=${resolvedQuality},format=auto${objectPath}`;
}
