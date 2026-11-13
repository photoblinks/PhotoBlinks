import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { AuthSubmitButton } from "@/components/public/auth-submit-button";
import { setPassword } from "./actions";

export const metadata: Metadata = {
  title: "Set your password",
  robots: { index: false, follow: false },
};

/** Landing page of the emailed set/reset-password link (/auth/confirm turns
 * the link into a session, then redirects here). Without a session the link
 * was invalid or expired. */
export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      `/forgot-password?error=${encodeURIComponent("This link is invalid or has expired. Request a new one below.")}`,
    );
  }

  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold">Set your password</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Choose a password for {user.email}. You&apos;ll use this email and password to log in.
      </p>
      <form action={setPassword} className="mt-8">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="password">New password</FieldLabel>
            <Input id="password" name="password" type="password" minLength={6} required autoFocus />
          </Field>
          <Field>
            <FieldLabel htmlFor="confirm">Confirm password</FieldLabel>
            <Input id="confirm" name="confirm" type="password" minLength={6} required />
          </Field>
          {error && <FieldError>{error}</FieldError>}
          <AuthSubmitButton label="Save password" pendingLabel="Saving…" />
        </FieldGroup>
      </form>
    </div>
  );
}
