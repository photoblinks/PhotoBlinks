import Link from "next/link";
import type { Metadata } from "next";
import { getActiveCountries, getActiveStates } from "@/lib/public-data";
import { PhotographerAuthShell } from "@/components/photographer/photographer-auth-shell";
import { PhotographerSignupForm } from "@/components/photographer/photographer-signup-form";

export const metadata: Metadata = {
  title: "Photographer Sign Up",
  robots: { index: false, follow: true },
};

export default async function PhotographerSignupPage() {
  const [countries, states] = await Promise.all([getActiveCountries(), getActiveStates()]);

  return (
    <PhotographerAuthShell active="signup">
      <h1 className="font-heading text-3xl font-semibold">Create photographer account</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your profile goes live after our team approves it.
      </p>

      <PhotographerSignupForm countries={countries} states={states} />

      <p className="mt-6 text-center text-xs text-muted-foreground">
        We&apos;ll email you a link to confirm your address first.
      </p>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Already registered?{" "}
        <Link href="/sign-in/photographer" className="font-medium text-pb-brand hover:underline">
          Log in
        </Link>
      </p>
    </PhotographerAuthShell>
  );
}
