import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updatePhotographerProfile } from "./actions";
import { getActiveCountries, getActiveStates } from "@/lib/public-data";
import { normalizeRelation } from "@/lib/supabase/require-photographer";
import { PHOTOGRAPHER_LANGUAGES, PHOTOGRAPHER_SERVICES } from "@/lib/photographer-options";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { AuthSubmitButton } from "@/components/public/auth-submit-button";
import { PhotographerProfileSummary } from "@/components/photographer/profile-summary";
import { CountryStateFields } from "@/components/photographer/country-state-fields";
import { ProfileImageField } from "@/components/photographer/profile-image-field";

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

  const { data: packages } = await supabase
    .from("photographer_packages")
    .select("actual_price, offer_price")
    .eq("photographer_id", user.id)
    .eq("is_visible", true);
  const prices = (packages ?? []).map((p) => p.offer_price ?? p.actual_price);
  const startingPrice = prices.length > 0 ? Math.min(...prices) : null;

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
          <ProfileImageField
            name="logo_url"
            label="Logo"
            hint="Square image works best. Shown on your card next to your studio name."
            shape="logo"
            defaultValue={profile?.logo_url}
          />
          <ProfileImageField
            name="banner_url"
            label="Banner image"
            hint="Wide photo shown at the top of your card."
            shape="banner"
            defaultValue={profile?.banner_url}
          />
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
            <FieldLabel>Starting price</FieldLabel>
            {startingPrice != null ? (
              <p className="text-sm">
                <span className="font-semibold">₹{startingPrice.toLocaleString("en-IN")}</span>{" "}
                <span className="text-muted-foreground">
                  — the lowest price across your packages (offer price when set).{" "}
                </span>
                <Link href="/photographer/packages" className="font-medium text-pb-brand hover:underline">
                  Manage packages
                </Link>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Your starting price comes from your packages. Create a package to show it on your card, and add an
                offer price there.{" "}
                <Link href="/photographer/packages" className="font-medium text-pb-brand hover:underline">
                  Create a package
                </Link>
              </p>
            )}
          </Field>
          <Field>
            <FieldLabel htmlFor="experience_years">Years of experience</FieldLabel>
            <Input
              id="experience_years"
              name="experience_years"
              type="number"
              min={0}
              max={60}
              defaultValue={profile?.experience_years ?? ""}
            />
          </Field>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Shoot types you offer</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="offers_pre_wedding"
                defaultChecked={profile?.offers_pre_wedding ?? true}
                className="size-4"
              />
              Pre-wedding
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="offers_wedding"
                defaultChecked={profile?.offers_wedding ?? false}
                className="size-4"
              />
              Wedding
            </label>
          </fieldset>
          <CheckboxGroup legend="Services" name="services" options={PHOTOGRAPHER_SERVICES} selected={profile?.services ?? []} />
          <CheckboxGroup legend="Languages spoken" name="languages" options={PHOTOGRAPHER_LANGUAGES} selected={profile?.languages ?? []} />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="travels_to_other_cities"
              defaultChecked={profile?.travels_to_other_cities ?? false}
              className="size-4"
            />
            I travel to other cities for shoots
          </label>
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
            <FieldLabel htmlFor="youtube_url">YouTube URL</FieldLabel>
            <Input
              id="youtube_url"
              name="youtube_url"
              type="url"
              defaultValue={profile?.youtube_url ?? ""}
              placeholder="https://youtube.com/@yourchannel"
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

function CheckboxGroup({
  legend,
  name,
  options,
  selected,
}: {
  legend: string;
  name: string;
  options: readonly string[];
  selected: string[];
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <label key={option} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name={name} value={option} defaultChecked={selected.includes(option)} className="size-4" />
            {option}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
