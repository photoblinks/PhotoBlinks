import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/supabase/require-permission";
import { getActiveCountries, getActiveStates } from "@/lib/public-data";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { AuthSubmitButton } from "@/components/public/auth-submit-button";
import { CountryStateFields } from "@/components/photographer/country-state-fields";
import { PhotographerStatusActions } from "@/components/admin/photographer-status-actions";
import { updatePhotographerProfileByAdmin } from "../actions";
import {
  PHOTOGRAPHER_STATUS_LABEL,
  type PhotographerProfileRow,
} from "../types";

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export default async function AdminPhotographerProfileDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  await requireAdminPage();

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { error, success } = await searchParams;

  const supabase = await createClient();
  const [{ data }, countries, states] = await Promise.all([
    supabase.rpc("get_admin_photographer_profiles", { p_profile_id: id, p_limit: 1 }),
    getActiveCountries(),
    getActiveStates(),
  ]);
  const profile = ((data ?? []) as PhotographerProfileRow[])[0];
  if (!profile) notFound();

  return (
    <div className="max-w-2xl">
      <Link href="/admin/photographer-profiles" className="text-sm text-pb-brand hover:underline">
        ← Photographer Profiles
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{profile.display_name}</h1>
        <Badge variant={profile.status === "active" ? "default" : profile.status === "suspended" ? "destructive" : "secondary"}>
          {PHOTOGRAPHER_STATUS_LABEL[profile.status]}
        </Badge>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Email</dt>
        <dd>{profile.email}</dd>
        <dt className="text-muted-foreground">Signed up</dt>
        <dd>{formatDateTime(profile.created_at)}</dd>
        <dt className="text-muted-foreground">Last sign-in</dt>
        <dd>{formatDateTime(profile.last_sign_in_at)}</dd>
        {profile.suspended_at && (
          <>
            <dt className="text-muted-foreground">Suspended on</dt>
            <dd>{formatDateTime(profile.suspended_at)}</dd>
          </>
        )}
      </dl>

      <div className="mt-6 rounded-lg border bg-card p-4">
        <h2 className="mb-1 text-sm font-medium">Account status</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          On hold and suspended both block photographer access; suspended also records the date.
        </p>
        <PhotographerStatusActions id={profile.id} current={profile.status} />
      </div>

      {success && (
        <p className="mt-6 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950/30 dark:text-green-400">
          Profile updated.
        </p>
      )}

      <form action={updatePhotographerProfileByAdmin.bind(null, profile.id)} className="mt-6">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="display_name">Full Name *</FieldLabel>
            <Input id="display_name" name="display_name" defaultValue={profile.display_name} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="studio_name">Photography Studio Name *</FieldLabel>
            <Input id="studio_name" name="studio_name" defaultValue={profile.studio_name} required />
          </Field>
          <CountryStateFields
            countries={countries}
            states={states}
            defaultCountryId={profile.country_id}
            defaultStateId={profile.state_id}
          />
          <Field>
            <FieldLabel htmlFor="city">City *</FieldLabel>
            <Input id="city" name="city" defaultValue={profile.city} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="bio">Bio</FieldLabel>
            <Textarea id="bio" name="bio" defaultValue={profile.bio ?? ""} />
          </Field>
          <Field>
            <FieldLabel htmlFor="phone_number">Phone Number *</FieldLabel>
            <Input id="phone_number" name="phone_number" type="tel" defaultValue={profile.phone_number} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="whatsapp_number">WhatsApp Number *</FieldLabel>
            <Input id="whatsapp_number" name="whatsapp_number" type="tel" defaultValue={profile.whatsapp_number} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="instagram_url">Instagram URL</FieldLabel>
            <Input id="instagram_url" name="instagram_url" type="url" defaultValue={profile.instagram_url ?? ""} />
          </Field>
          <Field>
            <FieldLabel htmlFor="portfolio_url">Portfolio URL</FieldLabel>
            <Input id="portfolio_url" name="portfolio_url" type="url" defaultValue={profile.portfolio_url ?? ""} />
          </Field>
          {error && <FieldError>{error}</FieldError>}
          <AuthSubmitButton label="Save changes" pendingLabel="Saving…" />
        </FieldGroup>
      </form>
    </div>
  );
}
