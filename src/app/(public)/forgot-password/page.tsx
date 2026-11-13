import type { Metadata } from "next";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { TurnstileWidget } from "@/components/public/turnstile-widget";
import { AuthSubmitButton } from "@/components/public/auth-submit-button";
import { requestPasswordReset } from "./actions";

export const metadata: Metadata = {
  title: "Forgot password",
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold">Forgot password</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Enter your account email and we&apos;ll send a link to set a new password.
      </p>
      {sent && (
        <p className="mt-4 text-sm text-pb-brand">
          If an account exists for that email, a password link is on its way.
        </p>
      )}
      <form action={requestPasswordReset} className="mt-8">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" name="email" type="email" required autoFocus />
          </Field>
          {error && <FieldError>{error}</FieldError>}
          <TurnstileWidget />
          <AuthSubmitButton label="Send link" pendingLabel="Sending…" />
        </FieldGroup>
      </form>
    </div>
  );
}
