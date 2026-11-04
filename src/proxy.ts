import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Permanent (301) redirects for published location/studio URLs that changed
// slug or were deleted — see 20260914010000_location_studio_slug_redirects.sql.
// A DB trigger is the only writer of these tables; they are read here through
// single-slug SECURITY DEFINER RPCs (resolve_location_slug / resolve_studio_slug,
// 20261103000000_resolve_slug_rpc.sql) because Phase 1 revoked the anon role's
// table-level SELECT. The same call says whether the slug is published, so a
// slug that exists nowhere gets a 404 here instead of an ISR entry per junk URL.
// Scoped to exactly one path segment so it never touches the
// country/state/city/category aggregation routes, and only queries when the
// path actually looks like a location/studio detail page.
const LOCATION_SLUG_RE = /^\/location\/([^/]+)\/?$/;
const STUDIO_SLUG_RE = /^\/studio\/([^/]+)\/?$/;

// Self-contained (inline style, no external assets) 404 page for slugs that
// exist nowhere; listing is the section the visitor was most likely after.
function notFoundHtml(kind: "location" | "studio") {
  const listing = kind === "location" ? { href: "/locations", label: "Browse locations" } : { href: "/studios", label: "Browse studios" };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page not found | PhotoBlinks</title></head><body style="font-family:system-ui,sans-serif;text-align:center;padding:4rem 1rem"><h1>Page not found</h1><p>This page doesn&#39;t exist or is no longer available.</p><p><a href="/">Back to home</a> &middot; <a href="${listing.href}">${listing.label}</a></p></body></html>`;
}

type SlugResolution ={ redirectTo: string | null; exists: boolean };

// Per-instance memo of successful lookups. Hits live longer than misses so a
// location published seconds ago is never 404 for more than MISSING_TTL_MS.
// Errors are never cached. Bounded so a flood of junk slugs can't grow it.
const FOUND_TTL_MS = 60_000;
const MISSING_TTL_MS = 5_000;
const LOOKUP_TIMEOUT_MS = 1_500;
const SLUG_CACHE_MAX = 500;
const slugCache = new Map<string, { value: SlugResolution; expiresAt: number }>();

/** null = lookup failed; callers must fail open and let the page handle it. */
async function resolveSlug(
  supabase: ReturnType<typeof createServerClient>,
  kind: "location" | "studio",
  slug: string,
): Promise<SlugResolution | null> {
  const key = `${kind}:${slug}`;
  const cached = slugCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const { data, error } = await supabase
      .rpc(`resolve_${kind}_slug`, { p_slug: slug })
      .abortSignal(AbortSignal.timeout(LOOKUP_TIMEOUT_MS))
      .maybeSingle();
    const row = data as { redirect_to: string | null; slug_exists: boolean } | null;
    if (error || !row) return null;

    const value = { redirectTo: row.redirect_to, exists: row.slug_exists };
    if (slugCache.size >= SLUG_CACHE_MAX) {
      const oldest = slugCache.keys().next().value;
      if (oldest !== undefined) slugCache.delete(oldest);
    }
    slugCache.set(key, {
      value,
      expiresAt: Date.now() + (value.redirectTo || value.exists ? FOUND_TTL_MS : MISSING_TTL_MS),
    });
    return value;
  } catch {
    return null;
  }
}

// Refreshes the Supabase auth session on every request so it doesn't expire
// mid-session in Server Components (which can't write cookies themselves).
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const locationMatch = request.nextUrl.pathname.match(LOCATION_SLUG_RE);
  const studioMatch = locationMatch ? null : request.nextUrl.pathname.match(STUDIO_SLUG_RE);
  const match = locationMatch ?? studioMatch;

  if (match) {
    const resolution = await resolveSlug(supabase, locationMatch ? "location" : "studio", match[1]);

    if (resolution?.redirectTo) {
      return NextResponse.redirect(new URL(resolution.redirectTo, request.url), 301);
    }
    // Only a successful lookup that found nothing 404s; a failed lookup falls
    // through to the page, which does its own notFound() check.
    if (resolution && !resolution.exists) {
      // Answered here, not rewritten to the app 404 page: a rewritten 404 is
      // served from the prerender cache with a week-long s-maxage (verified on
      // a production build), so a CDN would keep it after the slug is published.
      return new NextResponse(notFoundHtml(locationMatch ? "location" : "studio"), {
        status: 404,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex",
        },
      });
    }
  }

  // F7: the old ?category= query variant of the blog listing is replaced by
  // a dedicated /blog/category/[slug] page. Only redirect when the slug
  // resolves to a real, active category — an unknown/invalid slug falls
  // through to the plain /blog listing instead of creating a fake page.
  // Exact-path match (not a prefix) so /blog/[post-slug] is never touched.
  if (request.nextUrl.pathname === "/blog") {
    const categorySlug = request.nextUrl.searchParams.get("category");
    if (categorySlug) {
      const { data: category } = await supabase
        .from("blog_categories")
        .select("slug")
        .eq("slug", categorySlug)
        .eq("is_active", true)
        .maybeSingle();

      if (category) {
        return NextResponse.redirect(new URL(`/blog/category/${category.slug}`, request.url), 301);
      }
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (request.nextUrl.pathname.startsWith("/admin") && request.nextUrl.pathname !== "/admin/login" && !user) {
    const loginUrl = new URL("/admin/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // The bare /photographer dashboard route is exempt: it renders its own
  // email-verification-pending view for an unauthenticated request (right
  // after signup, before the confirmation link is used — Supabase issues
  // no session until then) instead of bouncing away, and redirects itself
  // when there's truly no session and no pending-signup marker. Every
  // other /photographer/* route (profile, submit-photo, ...) still
  // requires a real session at the middleware level, unchanged.
  if (
    request.nextUrl.pathname.startsWith("/photographer") &&
    request.nextUrl.pathname !== "/photographer" &&
    !user
  ) {
    return NextResponse.redirect(new URL("/sign-in/photographer", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|gif|avif|ico|woff2?|txt|xml|webmanifest)$).*)"],
};
