import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensurePhotographerProfileFromMetadata } from "@/lib/supabase/require-photographer";
import { AuthSubmitButton } from "@/components/public/auth-submit-button";
import { VerifyEmailBanner } from "@/components/public/verify-email-banner";
import { signOut } from "@/lib/auth-actions";

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
  let pendingApproval = false;
  if (user) {
    const { data: profile } = await supabase
      .from("photographer_profiles")
      .select("is_active, suspended_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profile) {
      // Suspended → the standalone signup route shows the notice. A profile
      // that is merely awaiting approval keeps full dashboard access.
      if (profile.suspended_at) redirect("/photographer/signup");
      pendingApproval = !profile.is_active;
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

  const navLinks = [
    { href: "/photographer", label: "Dashboard" },
    { href: "/photographer/profile", label: "Profile" },
    { href: "/photographer/packages", label: "Packages" },
    { href: "/photographer/share-location", label: "Share Location" },
    { href: "/", label: "Back to PhotoBlinks" },
  ];

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col border-b bg-muted/20 p-4 md:w-56 md:border-r md:border-b-0">
        <Link
          href="/photographer"
          className="mb-4 flex flex-col rounded-md px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:mb-6"
        >
          <span className="font-heading text-lg font-semibold">PhotoBlinks</span>
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Photographer
          </span>
        </Link>
        <nav className="flex flex-row flex-wrap gap-1 md:flex-1 md:flex-col">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-2 py-1.5 text-sm text-foreground/80 hover:bg-muted hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <form action={signOut} className="mt-4 md:mt-auto md:border-t md:pt-4">
          <AuthSubmitButton label="Log out" pendingLabel="Logging out…" variant="outline" size="sm" />
        </form>
      </aside>
      <main className="min-w-0 flex-1">
        <VerifyEmailBanner photographer />
        {pendingApproval && (
          <div className="border-b border-sky-200 bg-sky-50 px-4 py-2 text-center text-sm text-sky-900">
            Your profile is awaiting approval. It becomes visible on the website once your email is verified and
            PhotoBlinks approves it.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
