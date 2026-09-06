import Link from "next/link";
import type { Metadata } from "next";
import { signIn } from "@/lib/auth-actions";
import { safeNextPath } from "@/lib/safe-redirect";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { GoogleSignInButton } from "@/components/public/google-sign-in-button";
import { AuthDivider } from "@/components/public/auth-divider";
import { AuthSubmitButton } from "@/components/public/auth-submit-button";

export const metadata: Metadata = {
  title: "Sign In",
  robots: { index: false, follow: true },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; next?: string }>;
}) {
  const { error, notice, next: nextParam } = await searchParams;
  const next = safeNextPath(nextParam);

  return (
    <div className="mx-auto flex max-w-sm flex-col px-4 py-16 sm:px-6">
      <h1 className="font-heading text-2xl font-semibold">Sign In</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Sign in to save and share your favourite locations.
      </p>

      {notice && <p className="mt-6 text-sm text-pb-brand">{notice}</p>}

      <div className="mt-6">
        <GoogleSignInButton next={next} />
      </div>
      <AuthDivider />

      <form action={signIn}>
        <input type="hidden" name="next" value={next} />
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" name="email" type="email" required autoFocus />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input id="password" name="password" type="password" required />
          </Field>
          {error && <FieldError>{error}</FieldError>}
          <AuthSubmitButton label="Sign in" pendingLabel="Signing in…" />
        </FieldGroup>
      </form>

      <p className="mt-6 text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link
          href={`/sign-up?next=${encodeURIComponent(next)}`}
          className="font-medium text-pb-brand hover:underline"
        >
          Sign up
        </Link>
      </p>
    </div>
  );
}
