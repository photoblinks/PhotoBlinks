import { createClient } from "@/lib/supabase/server";

/** Supabase returns an embedded to-one relation (e.g. photographer_profiles
 * joined to countries/states) as either an object or a single-element
 * array depending on how the relationship is inferred. Normalizes either
 * shape to the single row or null. */
export function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** Whether the given user id has an active photographer profile.
 * Uses the normal request-scoped client — RLS applies per-user.
 * The own_read policy allows a photographer to read their own row. */
export async function isPhotographerUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const { data } = await supabase
    .from("photographer_profiles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  return data != null;
}

/** The current request's authenticated + active photographer user, or null.
 * Mirrors getAuthorizedAdminUser() — no service-role key involved. */
export async function getAuthorizedPhotographerUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return (await isPhotographerUser(supabase, user.id)) ? user : null;
}

/** True only if stateId names a real, active state belonging to the real,
 * active country countryId — the same canonical countries/states tables
 * Locations and Studios validate against (see src/app/admin/(shell)/
 * locations/actions.ts). Never trusts a submitted country/state id or
 * label on its own: both are re-checked against the database, and the
 * parent/child relationship between them is checked together so a
 * mismatched pair (a real state under the wrong country) is rejected too. */
export async function isValidCountryState(
  supabase: Awaited<ReturnType<typeof createClient>>,
  countryId: string,
  stateId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("states")
    .select("id")
    .eq("id", stateId)
    .eq("country_id", countryId)
    .eq("is_active", true)
    .maybeSingle();
  return data != null;
}

/** If this user's signup metadata (set by the combined account+profile
 * signup form at /sign-in/photographer — see its actions.ts) carries
 * photographer profile fields, creates the photographer_profiles row from
 * it now that a real session exists. That form can't insert the row
 * itself: with email confirmations required, signUp() returns no session
 * (no auth.uid()) until the confirmation link is used, and RLS needs a
 * real auth.uid() to allow the insert.
 *
 * A no-op for a Google sign-in, which carries no such metadata — that
 * case is handled by the dashboard page showing a completion popup
 * instead. Safe to call even if a profile already exists or was just
 * created concurrently (e.g. a prefetch): the unique constraint on
 * user_id makes a duplicate insert attempt harmless. */
export async function ensurePhotographerProfileFromMetadata(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: { id: string; user_metadata?: Record<string, unknown> },
): Promise<void> {
  if (user.user_metadata?.photographer_signup !== true) return;

  const meta = user.user_metadata;
  const { error } = await supabase.from("photographer_profiles").insert({
    user_id: user.id,
    display_name: String(meta.display_name ?? ""),
    studio_name: String(meta.studio_name ?? ""),
    country_id: String(meta.country_id ?? ""),
    state_id: String(meta.state_id ?? ""),
    city: String(meta.city ?? ""),
    phone_number: String(meta.phone_number ?? ""),
    whatsapp_number: String(meta.whatsapp_number ?? ""),
  });
  if (error && error.code !== "23505") {
    console.error("[ensurePhotographerProfileFromMetadata] insert failed:", error.message);
  }
}
