import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createPhotographerProfile } from "./actions";
import { ensurePhotographerProfileFromMetadata } from "@/lib/supabase/require-photographer";
import { getActiveCountries, getActiveStates } from "@/lib/public-data";
import { signOut } from "@/lib/auth-actions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { AuthSubmitButton } from "@/components/public/auth-submit-button";
import { CountryStateFields } from "@/components/photographer/country-state-fields";

export const metadata: Metadata = {
  title: "Become a Photographer",
  robots: { index: false, follow: true },
};

export default async function PhotographerSignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Proxy handles unauthenticated users; this catches the edge case where
  // the session expired between proxy check and page render.
  if (!user) redirect("/sign-in/photographer");

  // Check for any existing profile (active or suspended).
  const { data: existing } = await supabase
    .from("photographer_profiles")
    .select("is_active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing?.is_active) redirect("/photographer");

  // Combined signup at /sign-in/photographer already collected every
  // profile field and stashed it in this user's auth metadata because
  // signUp() returns no session — and therefore no auth.uid() for RLS —
  // until the email confirmation link is used. Now that there IS a real
  // session, create the row silently through the normal RLS-protected
  // own_insert policy and go straight to the dashboard, instead of asking
  // the user to retype everything they already submitted. No-op (and
  // falls through to the manual form below) for anyone without that
  // metadata, e.g. a Google sign-in.
  if (!existing) {
    await ensurePhotographerProfileFromMetadata(supabase, user);
    const { data: createdNow } = await supabase
      .from("photographer_profiles")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (createdNow) redirect("/photographer");
  }

  const suspended = existing != null && !existing.is_active;
  const [countries, states] = await Promise.all([getActiveCountries(), getActiveStates()]);

  return (
    <div className="mx-auto max-w-lg px-4 py-12 sm:px-6">
      <h1 className="font-heading text-2xl font-semibold">Become a Photographer</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Create your photographer profile to submit photos for locations.
      </p>

      {suspended ? (
        <div className="mt-6">
          <p className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Your photographer account is suspended. Please contact support.
          </p>
          <div className="mt-4 flex gap-2">
            <Link href="/" className="text-sm font-medium text-pb-brand hover:underline">
              Back to PhotoBlinks
            </Link>
            <form action={signOut} className="ml-auto">
              <Button type="submit" variant="outline" size="sm">
                Log out
              </Button>
            </form>
          </div>
        </div>
      ) : (
        <form action={createPhotographerProfile} className="mt-8">
          <input type="hidden" name="return_to" value="/photographer/signup" />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="display_name">Full Name *</FieldLabel>
              <Input id="display_name" name="display_name" required autoFocus />
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
            <Field>
              <FieldLabel htmlFor="bio">Bio</FieldLabel>
              <Textarea
                id="bio"
                name="bio"
                placeholder="Tell us about yourself (max 1000 characters)"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="phone_number">Phone Number *</FieldLabel>
              <Input id="phone_number" name="phone_number" type="tel" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="whatsapp_number">WhatsApp Number *</FieldLabel>
              <Input id="whatsapp_number" name="whatsapp_number" type="tel" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="instagram_url">Instagram URL</FieldLabel>
              <Input
                id="instagram_url"
                name="instagram_url"
                type="url"
                placeholder="https://instagram.com/yourhandle"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="portfolio_url">Portfolio URL</FieldLabel>
              <Input
                id="portfolio_url"
                name="portfolio_url"
                type="url"
                placeholder="https://yourwebsite.com"
              />
            </Field>
            {error && <FieldError>{error}</FieldError>}
            <AuthSubmitButton label="Create profile" pendingLabel="Creating profile…" />
          </FieldGroup>
        </form>
      )}
    </div>
  );
}
