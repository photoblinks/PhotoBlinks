import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updatePhotographerProfile } from "./actions";
import { getActiveCountries, getActiveStates } from "@/lib/public-data";
import { normalizeRelation } from "@/lib/supabase/require-photographer";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { AuthSubmitButton } from "@/components/public/auth-submit-button";
import { PhotographerProfileSummary } from "@/components/photographer/profile-summary";
import { CountryStateFields } from "@/components/photographer/country-state-fields";

export const metadata: Metadata = {
  title: "My Profile",
  robots: { index: false, follow: true },
};

export default async function PhotographerProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error, success } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The shell layout no longer redirects unauthenticated visitors away by
  // itself (the dashboard route needs to render its own verification-
  // pending view for a no-session request) — every other /photographer/*
  // page, this one included, still requires a real session on its own.
  if (!user) redirect("/sign-in/photographer");

  const [{ data: profile }, countries, states] = await Promise.all([
    supabase
      .from("photographer_profiles")
      .select("*, countries(name), states(name)")
      .eq("user_id", user.id)
      .single(),
    getActiveCountries(),
    getActiveStates(),
  ]);

  const countryName = normalizeRelation(profile?.countries)?.name ?? null;
  const stateName = normalizeRelation(profile?.states)?.name ?? null;

  return (
    <div className="mx-auto max-w-lg px-4 py-12 sm:px-6">
      <h1 className="font-heading text-2xl font-semibold">My Profile</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Update your public photographer profile.
      </p>

      {profile && (
        <div className="mt-6 rounded-lg border bg-card p-4">
          <PhotographerProfileSummary
            profile={{ ...profile, country_name: countryName, state_name: stateName }}
            email={user!.email}
          />
        </div>
      )}

      {success && (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950/30 dark:text-green-400">
          Profile updated.
        </p>
      )}

      <form action={updatePhotographerProfile} className="mt-8">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="display_name">Full Name *</FieldLabel>
            <Input
              id="display_name"
              name="display_name"
              defaultValue={profile?.display_name ?? ""}
              required
              autoFocus
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="studio_name">Photography Studio Name *</FieldLabel>
            <Input
              id="studio_name"
              name="studio_name"
              defaultValue={profile?.studio_name ?? ""}
              required
            />
          </Field>
          <CountryStateFields
            countries={countries}
            states={states}
            defaultCountryId={profile?.country_id ?? undefined}
            defaultStateId={profile?.state_id ?? undefined}
          />
          <Field>
            <FieldLabel htmlFor="city">City *</FieldLabel>
            <Input
              id="city"
              name="city"
              defaultValue={profile?.city ?? ""}
              placeholder="Bengaluru"
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="bio">Bio</FieldLabel>
            <Textarea
              id="bio"
              name="bio"
              defaultValue={profile?.bio ?? ""}
              placeholder="Tell us about yourself (max 1000 characters)"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="phone_number">Phone Number *</FieldLabel>
            <Input
              id="phone_number"
              name="phone_number"
              type="tel"
              defaultValue={profile?.phone_number ?? ""}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="whatsapp_number">WhatsApp Number *</FieldLabel>
            <Input
              id="whatsapp_number"
              name="whatsapp_number"
              type="tel"
              defaultValue={profile?.whatsapp_number ?? ""}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="instagram_url">Instagram URL</FieldLabel>
            <Input
              id="instagram_url"
              name="instagram_url"
              type="url"
              defaultValue={profile?.instagram_url ?? ""}
              placeholder="https://instagram.com/yourhandle"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="portfolio_url">Portfolio URL</FieldLabel>
            <Input
              id="portfolio_url"
              name="portfolio_url"
              type="url"
              defaultValue={profile?.portfolio_url ?? ""}
              placeholder="https://yourwebsite.com"
            />
          </Field>
          {error && <FieldError>{error}</FieldError>}
          <AuthSubmitButton label="Save changes" pendingLabel="Saving…" />
        </FieldGroup>
      </form>
    </div>
  );
}
