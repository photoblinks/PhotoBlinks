"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/safe-redirect";

/** Starts Supabase Auth's OAuth flow for Google. signInWithOAuth (browser
 * client) redirects the tab to Google itself — Supabase's SDK owns the
 * PKCE code_verifier/state handling, nothing here touches a Google token.
 * On return, /auth/callback exchanges the code for a session and lands the
 * user back on `next`. */
export function GoogleSignInButton({ next }: { next: string }) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (pending) return;
    setPending(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // window.location.origin, NOT the SEO-only NEXT_PUBLIC_SITE_URL
        // (src/lib/jsonld.ts's absoluteUrl, hardcoded to the production
        // domain) — this must match wherever the app is ACTUALLY running
        // (localhost:3100 in dev, the real domain in production), or
        // Supabase rejects the post-Google redirect_to as not allow-listed.
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNextPath(next))}`,
      },
    });

    // signInWithOAuth navigates the browser away on success, so this only
    // runs if the request itself failed before ever reaching Google (e.g.
    // the provider isn't configured) — reset so the button isn't stuck.
    if (error) setPending(false);
  }

  return (
    <Button type="button" variant="outline" className="w-full" onClick={handleClick} disabled={pending}>
      <GoogleIcon className="size-4" />
      {pending ? "Redirecting…" : "Continue with Google"}
    </Button>
  );
}

function GoogleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.47a5.53 5.53 0 0 1-2.4 3.63v2.99h3.87c2.27-2.09 3.58-5.17 3.58-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.92l-3.87-2.99c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.95H1.27v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.27a12 12 0 0 0 0 10.76l4-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.61 4.58 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.62l4 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}
