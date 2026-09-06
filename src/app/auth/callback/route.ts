import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";

// OAuth (Google) redirect target — Supabase's own documented PKCE callback
// pattern for @supabase/ssr apps. GoogleSignInButton starts the flow via
// supabase.auth.signInWithOAuth({ redirectTo: absoluteUrl("/auth/callback?next=...") }),
// Google/Supabase send the browser back here with a `code`, and
// exchangeCodeForSession is the standard supabase-js call that turns it
// into a session — no manual token handling, no custom OAuth client code.
// A redirect response has no cache directives by default so it isn't
// cached by a CDN/browser either way, but this route exchanges a one-time,
// per-user code — explicit no-store rules out any ambiguity.
export const dynamic = "force-dynamic";

function redirectNoStore(url: string) {
  return NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return redirectNoStore(`${origin}${next}`);
    }
  }

  return redirectNoStore(
    `${origin}/sign-in?error=${encodeURIComponent("Could not sign in with Google. Please try again.")}`,
  );
}
