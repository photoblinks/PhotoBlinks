"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Every mutation below derives the acting user from the server-side
// Supabase session (auth.getUser()) — never from a client-supplied user id
// — and every table write is additionally enforced by RLS (see
// 20260904020000_favourites.sql), so this is defense in depth, not the only
// guard.

/** Toggles the current user's favourite on a location. Returns the new
 * state so the calling client component can update optimistically-applied
 * UI without a full page reload. Requires a signed-in user — the caller is
 * responsible for prompting sign-in first (see FavouritesProvider). */
export async function toggleFavourite(
  locationId: string,
): Promise<{ favourited: boolean } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "sign_in_required" };

  const { data: existing } = await supabase
    .from("favourites")
    .select("id")
    .eq("user_id", user.id)
    .eq("location_id", locationId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("favourites").delete().eq("id", existing.id);
    if (error) return { error: error.message };
    revalidatePath("/favourites");
    return { favourited: false };
  }

  // UNIQUE(user_id, location_id) is also enforced at the DB level (see the
  // migration) — a double-click race that slips past the existing-row check
  // above still can't create a duplicate row.
  const { error } = await supabase
    .from("favourites")
    .insert({ user_id: user.id, location_id: locationId });
  if (error) return { error: error.message };
  revalidatePath("/favourites");
  return { favourited: true };
}

function generateShareToken() {
  // 32 random bytes, base64url-encoded (~43 chars, no padding/unsafe URL
  // chars) — matches the project's "cryptographically strong, non-guessable"
  // requirement. Never derived from user id, email, or a sequential id.
  return randomBytes(32).toString("base64url");
}

async function upsertShareToken(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = generateShareToken();
    const { error } = await supabase
      .from("share_collections")
      .upsert({ user_id: userId, token, revoked_at: null }, { onConflict: "user_id" });
    if (!error) return;
    // 23505 = unique_violation — an astronomically rare token collision.
    // Retry with a fresh token rather than surfacing the wrong link.
    if (error.code !== "23505") throw new Error(error.message);
  }
  throw new Error("Could not generate a unique share token. Please try again.");
}

/** Get-or-create: returns the user's existing active share link unchanged,
 * or creates one (fresh token) if none exists or the existing one was
 * revoked. Later clicks are idempotent — this never rotates an already
 * active link. Only ever invoked from the already auth-gated /favourites
 * page (see page.tsx's own redirect), so a missing session here just
 * redirects rather than needing a client-visible error state. */
export async function createShareLink(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/favourites");

  const { data: existing } = await supabase
    .from("share_collections")
    .select("revoked_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing || existing.revoked_at !== null) {
    await upsertShareToken(supabase, user.id);
  }
  revalidatePath("/favourites");
}

/** Always issues a brand-new token, invalidating the previous link even if
 * it was still active. */
export async function regenerateShareLink(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/favourites");

  await upsertShareToken(supabase, user.id);
  revalidatePath("/favourites");
}

/** Stops the current share link from resolving publicly. The row (and its
 * token) is kept, not deleted, so "Share Favourites" afterward creates a
 * fresh token rather than resurrecting the revoked one. */
export async function revokeShareLink(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/favourites");

  await supabase
    .from("share_collections")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", user.id);
  revalidatePath("/favourites");
}
