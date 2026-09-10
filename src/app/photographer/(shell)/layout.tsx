import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensurePhotographerProfileFromMetadata } from "@/lib/supabase/require-photographer";
import { signOut } from "@/lib/auth-actions";
import { Button } from "@/components/ui/button";

export default async function PhotographerShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No session at all (e.g. just signed up, still unverified — email
  // confirmations are required, so Supabase issues no session until the
  // link is clicked) is NOT redirected away here: the dashboard page
  // itself decides — it shows a verification-pending view when it
  // recognizes the request (?pending_email=), otherwise sends the visitor
  // to sign in. Every other /photographer/* route still requires a real
  // session and redirects itself if one is missing (see their own pages).
  if (user) {
    const { data: profile } = await supabase
      .from("photographer_profiles")
      .select("is_active")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profile) {
      // Suspended → the standalone signup route also shows this notice.
      if (!profile.is_active) redirect("/photographer/signup");
    } else {
      // No profile yet. The combined signup form (/sign-in/photographer)
      // stashed the profile fields in this user's signup metadata since it
      // couldn't insert them itself yet — consume it now. A Google sign-in
      // carries no such metadata, so this is a no-op for that case; the
      // dashboard page (the only /photographer/* route Google sign-in lands
      // on) shows a mandatory completion popup instead of the real content.
      await ensurePhotographerProfileFromMetadata(supabase, user);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center gap-4 px-4 sm:px-6">
          <Link
            href="/photographer"
            className="flex items-baseline gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="font-heading text-lg font-semibold">PhotoBlinks</span>
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Photographer
            </span>
          </Link>
          <nav className="ml-auto flex items-center gap-1">
            <Link
              href="/photographer"
              className="rounded-md px-2 py-1.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
            >
              Dashboard
            </Link>
            <Link
              href="/photographer/profile"
              className="rounded-md px-2 py-1.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
            >
              Profile
            </Link>
            <Link
              href="/"
              className="rounded-md px-2 py-1.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
            >
              Back to PhotoBlinks
            </Link>
            <form action={signOut}>
              <Button type="submit" variant="outline" size="sm">
                Log out
              </Button>
            </form>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
