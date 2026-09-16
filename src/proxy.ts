import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Permanent (301) redirects for published location/studio URLs that changed
// slug or were deleted — see 20260914010000_location_studio_slug_redirects.sql.
// A DB trigger is the only writer of these tables; this is their sole
// reader. Scoped to exactly one path segment so it never touches the
// country/state/city/category aggregation routes, and only queries when
// the path actually looks like a location/studio detail page.
const LOCATION_SLUG_RE = /^\/location\/([^/]+)\/?$/;
const STUDIO_SLUG_RE = /^\/studio\/([^/]+)\/?$/;

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
    const table = locationMatch ? "location_slug_redirects" : "studio_slug_redirects";
    const oldSlug = match[1];
    const { data: redirectRow } = await supabase
      .from(table)
      .select("redirect_to")
      .eq("old_slug", oldSlug)
      .maybeSingle();

    if (redirectRow) {
      return NextResponse.redirect(new URL(redirectRow.redirect_to, request.url), 301);
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)"],
};
