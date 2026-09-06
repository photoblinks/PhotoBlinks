import Link from "next/link";
import type { Metadata } from "next";
import { signUp } from "@/lib/auth-actions";
import { safeNextPath } from "@/lib/safe-redirect";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { GoogleSignInButton } from "@/components/public/google-sign-in-button";
import { AuthDivider } from "@/components/public/auth-divider";
import { AuthSubmitButton } from "@/components/public/auth-submit-button";

export const metadata: Metadata = {
  title: "Sign Up",
  robots: { index: false, follow: true },
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next: nextParam } = await searchParams;
  const next = safeNextPath(nextParam);

  return (
    <div className="mx-auto flex max-w-sm flex-col px-4 py-16 sm:px-6">
      <h1 className="font-heading text-2xl font-semibold">Sign Up</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Create an account to save and share your favourite locations.
      </p>

      <div className="mt-6">
        <GoogleSignInButton next={next} />
      </div>
      <AuthDivider />

      <form action={signUp}>
        <input type="hidden" name="next" value={next} />
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" name="email" type="email" required autoFocus />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input id="password" name="password" type="password" minLength={6} required />
          </Field>
          {error && <FieldError>{error}</FieldError>}
          <AuthSubmitButton label="Create account" pendingLabel="Creating account…" />
        </FieldGroup>
      </form>

      <p className="mt-6 text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href={`/sign-in?next=${encodeURIComponent(next)}`}
          className="font-medium text-pb-brand hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
