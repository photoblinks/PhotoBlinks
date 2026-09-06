"use server";

import { createClient } from "@/lib/supabase/server";
import { getApprovedLocationComments, type PublicLocationComment } from "@/lib/public-data";

const MAX_COMMENT_LENGTH = 1000;

type SubmitResult =
  | { ok: true }
  | { error: "sign_in_required" | "invalid_rating" | "too_long" | "failed" };

/** Submits a rating (required, 1-5) with an optional comment as the
 * signed-in user. Every value the database actually trusts (user_id,
 * status) is derived server-side from the session or a hardcoded default
 * — never taken from the client — and RLS (location_comments_insert_own)
 * enforces the same thing again at the database layer, so a
 * bypassed/forged client call still can't insert as another user or
 * pre-approve itself. The rating range is enforced a third time by the
 * column's own CHECK constraint. */
export async function createLocationComment(
  locationId: string,
  formData: FormData,
): Promise<SubmitResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "sign_in_required" };

  const rating = Number(formData.get("rating"));
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "invalid_rating" };

  const rawComment = String(formData.get("comment") ?? "").trim();
  if (rawComment.length > MAX_COMMENT_LENGTH) return { error: "too_long" };
  const comment = rawComment || null;

  // Duplicate-submit guard (double-click / double-tap), not real spam
  // protection: skip re-inserting an identical rating+comment from this
  // user on this location made in the last minute, rather than creating a
  // second pending row.
  const oneMinuteAgo = new Date(new Date().getTime() - 60_000).toISOString();
  let duplicateQuery = supabase
    .from("location_comments")
    .select("id")
    .eq("user_id", user.id)
    .eq("location_id", locationId)
    .eq("rating", rating)
    .gte("created_at", oneMinuteAgo);
  duplicateQuery = comment ? duplicateQuery.eq("comment", comment) : duplicateQuery.is("comment", null);
  const { data: recentDuplicate } = await duplicateQuery.maybeSingle();

  if (recentDuplicate) return { ok: true };

  // status is intentionally omitted — the column default ('pending') and
  // the RLS with-check both fix it, so nothing here can set it to anything
  // else.
  const { error } = await supabase
    .from("location_comments")
    .insert({ user_id: user.id, location_id: locationId, comment, rating });

  if (error) return { error: "failed" };
  return { ok: true };
}

/** Fetches the next page of approved comments for "Load more" — reuses the
 * same cached public-data function the initial page render uses, just at
 * a later offset. */
export async function loadMoreLocationComments(
  locationId: string,
  offset: number,
): Promise<PublicLocationComment[]> {
  return getApprovedLocationComments(locationId, offset);
}
