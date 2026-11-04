import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth-actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { GoogleSignInButton } from "@/components/public/google-sign-in-button";
import { AuthDivider } from "@/components/public/auth-divider";
import { AuthSubmitButton } from "@/components/public/auth-submit-button";
import { PhotographerAuthShell } from "@/components/photographer/photographer-auth-shell";

export const metadata: Metadata = {
  title: "Photographer Login",
  robots: { index: false, follow: true },
};

// Photographers use the same Supabase account pool as customers — there is
// no separate photographer auth system. Signing in lands straight on the
// dashboard (/photographer); the shell layout there already redirects to
// /photographer/signup on its own if no profile exists yet (new Google
// sign-ins) or the profile is awaiting approval.
const LOGIN_NEXT = "/photographer";

export default async function PhotographerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; error?: string; notice?: string }>;
}) {
  const { mode, error, notice } = await searchParams;
  // Links from before login and signup were split into two pages.
  if (mode === "signup") redirect("/sign-in/photographer/signup");

  return (
    <PhotographerAuthShell active="login">
      <h1 className="font-heading text-3xl font-semibold">Photographer login</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Manage your profile and photo submissions.
      </p>

      {notice && <p className="mt-4 text-sm text-pb-brand">{notice}</p>}

      <form action={signIn} className="mt-8">
        <input type="hidden" name="next" value={LOGIN_NEXT} />
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@studio.com"
              required
              autoFocus
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input id="password" name="password" type="password" required />
          </Field>
          {error && <FieldError>{error}</FieldError>}
          <AuthSubmitButton label="Log in" pendingLabel="Signing in…" />
        </FieldGroup>
      </form>

      <AuthDivider />
      <GoogleSignInButton next={LOGIN_NEXT} />

      <p className="mt-8 text-center text-sm text-muted-foreground">New to PhotoBlinks?</p>
      <Button
        render={<Link href="/sign-in/photographer/signup" />}
        variant="outline"
        className="mt-2 w-full"
      >
        Create a photographer account
      </Button>
    </PhotographerAuthShell>
  );
}
