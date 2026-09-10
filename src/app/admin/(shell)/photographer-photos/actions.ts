"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { deletePhotographerSubmissionObject } from "@/lib/r2/upload";

// reviewed_by is always the authenticated admin's user ID derived server-side
// from the session — it is never accepted from the browser. This mirrors the
// security constraint stated in Phase 8: "browser cannot choose reviewed_by".
// RLS admin_all policy already gates these writes; the is_admin() check in the
// layout redirects non-admins before any action can be invoked.

export async function approveSubmission(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Same compare-and-swap protection as rejectSubmission: read the row's
  // current status first and refuse to approve a row already rejected.
  // Rejection may already have deleted the R2 object, so a stale "Approve"
  // click on an old tab must never flip status back to 'approved' — that
  // would publish a now-deleted image on the public gallery.
  const { data: current } = await supabase
    .from("photographer_photo_submissions")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (!current || current.status === "rejected") return;

  await supabase
    .from("photographer_photo_submissions")
    .update({
      status: "approved",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: null,
    })
    .eq("id", id)
    .eq("status", current.status);

  revalidatePath("/admin/photographer-photos");
}

export async function rejectSubmission(id: string, formData: FormData) {
  const reason = ((formData.get("rejection_reason") as string) ?? "").trim() || null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Read the row's current status first so the moderation update below can
  // be conditioned on it (compare-and-swap). This is what protects an
  // already-approved photo from a stale admin tab: if another admin
  // approved this row after the current admin's page loaded, the CAS
  // affects zero rows and nothing is rejected or deleted — the moderation
  // decision that's actually recorded always matches a status this admin
  // genuinely saw at write time, not a stale one from page load.
  const { data: current } = await supabase
    .from("photographer_photo_submissions")
    .select("status, storage_key, storage_bucket, photographer_id")
    .eq("id", id)
    .maybeSingle();
  if (!current || current.status === "rejected") return;

  const { data: updated } = await supabase
    .from("photographer_photo_submissions")
    .update({
      status: "rejected",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason,
    })
    .eq("id", id)
    .eq("status", current.status)
    .select("id")
    .maybeSingle();

  // Lost the race (row no longer matches the status we just read) — safe,
  // silent no-op, same convention as the rest of this admin queue.
  if (!updated) return;

  // The rejection above is already committed and authoritative regardless
  // of what happens next — R2 cleanup is attempted afterward and never
  // rolls back a valid moderation decision just because R2 is unavailable.
  const result = await deletePhotographerSubmissionObject({
    storageKey: current.storage_key,
    storageBucket: current.storage_bucket,
    photographerId: current.photographer_id,
  });

  await supabase
    .from("photographer_photo_submissions")
    .update({ r2_deletion_status: result.ok ? "deleted" : "failed" })
    .eq("id", id);

  revalidatePath("/admin/photographer-photos");
}

/** Retries R2 cleanup for a rejected submission whose earlier deletion
 * attempt failed (or was never attempted). Every value used for the
 * delete — storage_key, storage_bucket, photographer_id — is loaded from
 * the submission's own row server-side; the browser supplies only the
 * submission id. Re-guarded to rejected-only rows on both the read and the
 * final status write, so this can never touch an approved or pending
 * submission's object even if called with a stale/wrong id from an old
 * page. Safe to retry: a submission already marked 'deleted' is skipped,
 * and DeleteObject itself doesn't error on an already-absent key. */
export async function retryCleanup(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: submission } = await supabase
    .from("photographer_photo_submissions")
    .select("storage_key, storage_bucket, photographer_id, r2_deletion_status")
    .eq("id", id)
    .eq("status", "rejected")
    .maybeSingle();
  if (!submission || submission.r2_deletion_status === "deleted") return;

  const result = await deletePhotographerSubmissionObject({
    storageKey: submission.storage_key,
    storageBucket: submission.storage_bucket,
    photographerId: submission.photographer_id,
  });

  await supabase
    .from("photographer_photo_submissions")
    .update({ r2_deletion_status: result.ok ? "deleted" : "failed" })
    .eq("id", id)
    .eq("status", "rejected");

  revalidatePath("/admin/photographer-photos");
}
