import Link from "next/link";
import type { Metadata } from "next";
import { Camera } from "lucide-react";
import { signIn } from "@/lib/auth-actions";
import { signUpPhotographer } from "./actions";
import { getActiveCountries, getActiveStates } from "@/lib/public-data";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { GoogleSignInButton } from "@/components/public/google-sign-in-button";
import { AuthDivider } from "@/components/public/auth-divider";
import { AuthSubmitButton } from "@/components/public/auth-submit-button";
import { CountryStateFields } from "@/components/photographer/country-state-fields";

export const metadata: Metadata = {
  title: "Photographer Sign In",
  robots: { index: false, follow: true },
};

// Photographers use the same Supabase account pool as customers — there is
// no separate photographer auth system. Signing in lands straight on the
// dashboard (/photographer); the shell layout there already redirects to
// /photographer/signup on its own if no profile exists yet (new Google
// sign-ins, or anyone who reaches this page without having used the
// signup form below).
const LOGIN_NEXT = "/photographer";

export default async function PhotographerSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; error?: string; notice?: string }>;
}) {
  const { mode: modeParam, error, notice } = await searchParams;
  const mode: "login" | "signup" = modeParam === "signup" ? "signup" : "login";

  // Only fetched for the signup view, but cheap (cached) either way and
  // keeps this a single server component instead of splitting it up.
  const [countries, states] = await Promise.all([getActiveCountries(), getActiveStates()]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl bg-background shadow-xl md:grid-cols-2">
        {/* Branding panel — decorative only, hidden on small screens */}
        <div className="hidden flex-col items-center justify-center gap-6 bg-gradient-to-br from-pb-brand to-pb-brand-bright p-10 text-center text-white md:flex">
          <div className="flex size-16 items-center justify-center rounded-full bg-white/15">
            <Camera className="size-8" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-heading text-2xl font-semibold">PhotoBlinks</h2>
            <p className="mt-1 text-sm tracking-wide text-white/80 uppercase">For Photographers</p>
          </div>
          <p className="max-w-xs text-sm text-white/70">
            Submit your best pre-wedding shoots and get discovered by couples across Karnataka
            &amp; Kerala.
          </p>
          <div className="flex gap-1.5" aria-hidden="true">
            <span className="size-1.5 rounded-full bg-white" />
            <span className="size-1.5 rounded-full bg-white/40" />
            <span className="size-1.5 rounded-full bg-white/40" />
            <span className="size-1.5 rounded-full bg-white/40" />
          </div>
        </div>

        {/* Login / Signup form */}
        <div className="flex flex-col justify-center p-8 sm:p-10">
          {mode === "login" ? (
            <>
              <h1 className="font-heading text-2xl font-semibold">
                <span className="text-pb-brand">Photographer Account</span> Login
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Sign in to manage your photographer profile and submissions.
              </p>

              {notice && <p className="mt-4 text-sm text-pb-brand">{notice}</p>}

              <form action={signIn} className="mt-8">
                <input type="hidden" name="next" value={LOGIN_NEXT} />
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="email">Email Id</FieldLabel>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="you@example.com"
                      required
                      autoFocus
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="password">Password</FieldLabel>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      placeholder="Enter your password"
                      required
                    />
                  </Field>
                  {error && <FieldError>{error}</FieldError>}
                  <AuthSubmitButton label="Login" pendingLabel="Signing in…" />
                </FieldGroup>
              </form>

              <AuthDivider />

              <GoogleSignInButton next={LOGIN_NEXT} />

              <p className="mt-8 text-center text-sm text-muted-foreground">New photographer?</p>
              <Button
                render={<Link href={`${"/sign-in/photographer"}?mode=signup`} />}
                variant="outline"
                className="mt-2 w-full"
              >
                Photographer Account Signup
              </Button>
            </>
          ) : (
            <>
              <h1 className="font-heading text-2xl font-semibold">
                <span className="text-pb-brand">Photographer Account</span> Signup
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Create your account and photographer profile in one step.
              </p>

              {notice && <p className="mt-4 text-sm text-pb-brand">{notice}</p>}

              <form action={signUpPhotographer} className="mt-6">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="full_name">Full Name *</FieldLabel>
                    <Input id="full_name" name="full_name" required autoFocus />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="studio_name">Photography Studio Name *</FieldLabel>
                    <Input id="studio_name" name="studio_name" required />
                  </Field>
                  <CountryStateFields countries={countries} states={states} />
                  <Field>
                    <FieldLabel htmlFor="city">City *</FieldLabel>
                    <Input id="city" name="city" placeholder="Bengaluru" required />
                  </Field>
                  <Field orientation="responsive">
                    <Field>
                      <FieldLabel htmlFor="phone_number">Phone Number *</FieldLabel>
                      <Input id="phone_number" name="phone_number" type="tel" required />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="whatsapp_number">WhatsApp Number *</FieldLabel>
                      <Input id="whatsapp_number" name="whatsapp_number" type="tel" required />
                    </Field>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="signup_email">Email Id *</FieldLabel>
                    <Input id="signup_email" name="email" type="email" required />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="signup_password">Password *</FieldLabel>
                    <Input
                      id="signup_password"
                      name="password"
                      type="password"
                      minLength={6}
                      required
                    />
                  </Field>
                  {error && <FieldError>{error}</FieldError>}
                  <AuthSubmitButton label="Create Account" pendingLabel="Creating account…" />
                </FieldGroup>
              </form>

              <p className="mt-6 text-center text-xs text-muted-foreground">
                We&apos;ll email you a link to confirm your address before you can sign in.
              </p>

              <p className="mt-4 text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link
                  href="/sign-in/photographer?mode=login"
                  className="font-medium text-pb-brand hover:underline"
                >
                  Photographer Account Login
                </Link>
              </p>
            </>
          )}

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Not a photographer?{" "}
            <Link href="/sign-in" className="font-medium text-pb-brand hover:underline">
              Sign in as a customer
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
