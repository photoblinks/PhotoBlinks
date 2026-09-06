import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";

// Handles the link Supabase Auth's confirmation/magic-link/recovery emails
// point at (see supabase/templates/confirmation.html and
// config.toml's [auth.email.template.confirmation], which build this URL as
// `${SITE_URL}/auth/confirm?token_hash=...&type=signup&next=...`). This is
// Supabase's own documented PKCE-flow confirmation route for @supabase/ssr
// apps — not a custom confirmation-token system: verifyOtp() is the
// standard supabase-js call that turns the token Supabase generated into a
// real session, via the same cookie-writing server client every other auth
// action already uses.
// Belt-and-suspenders: a redirect response has no cache directives by
// default so it isn't cached by a CDN/browser either way, but this route
// resolves a one-time, per-user token — explicit no-store rules out any
// ambiguity.
export const dynamic = "force-dynamic";

function redirectNoStore(url: string) {
  return NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next"));

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return redirectNoStore(`${origin}${next}`);
    }
  }

  return redirectNoStore(
    `${origin}/sign-in?error=${encodeURIComponent("This confirmation link is invalid or has expired.")}`,
  );
}
