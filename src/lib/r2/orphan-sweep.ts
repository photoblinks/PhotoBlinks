import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { r2Client, R2_BUCKET_NAME } from "./client";
import { deletePhotographerSubmissionObject } from "./upload";
import { createAdminClient } from "@/lib/supabase/admin";

// Exact key shape written by /api/photographer/r2-presign (see that route):
// photographers/{auth-user-uuid}/{epoch-millis}.{jpg|png|webp}. Any key that
// doesn't match this precisely — a nested subdirectory, a non-UUID segment,
// an unrecognized extension, anything outside this shape — is left alone.
// This is what keeps the sweep confined to exactly the photographer upload
// namespace instead of treating "starts with photographers/" as enough.
const PHOTOGRAPHER_KEY_PATTERN =
  /^photographers\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(\d+)\.(jpg|png|webp)$/i;

// Never touch an object uploaded more recently than this. Protects a slow
// upload, a transient DB failure during the submission INSERT, or the
// ordinary few-second gap between the R2 PUT completing and the submission
// row landing — all normal timing, not evidence of abandonment. This is
// also the primary defense against the race in section 14 of the spec:
// a real submission row almost always lands within seconds of the upload,
// nowhere near 24h later.
const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

// Conservative bound on objects inspected per sweep run. One ListObjectsV2
// page (S3/R2 max 1000 keys/page) comfortably covers this namespace's
// realistic volume and keeps both the in-memory candidate list and the
// batched DB cross-check bounded. A namespace that grows past this needs
// repeated sweep runs rather than one run trying to drain it all —
// ContinuationToken support is here, but a single invocation stops at this
// cap regardless of how much more there is to list.
const MAX_OBJECTS_PER_SWEEP = 1000;

// Supabase/PostgREST sends .in() filters as a query string — keep each
// batch small enough to stay well under typical URL length limits.
const DB_CHECK_BATCH_SIZE = 200;

export type SweepResult = {
  dryRun: boolean;
  scanned: number;
  candidates: number;
  deleted: number;
  skipped: number;
  failed: number;
  /** Only populated on a dry run, for operator visibility. Never populated
   * (and never logged) on a real run. */
  candidateKeys?: string[];
};

/**
 * Finds and (unless dryRun) deletes R2 objects under photographers/ that
 * have no corresponding photographer_photo_submissions.storage_key row and
 * are older than GRACE_PERIOD_MS — the orphan left behind when Phase 6's
 * upload-then-insert pipeline succeeds on R2 but fails the database INSERT.
 *
 * Scope is intentionally narrow: this only ever lists/deletes inside the
 * photographers/ prefix, using the single configured R2_BUCKET_NAME, with a
 * key shape and namespace fixed in code — nothing here accepts a caller-
 * supplied bucket, prefix, or key. It is not a general-purpose R2 garbage
 * collector and must never be extended into one.
 *
 * Uses the service-role Supabase client (src/lib/supabase/admin.ts) rather
 * than a per-request session client: this is a trusted maintenance
 * operation with no user session of its own (it can run from a scheduler
 * with no browser/cookies at all), the same carve-out already used by
 * scripts/seed-admin.mjs. It reads photographer_photo_submissions.storage_key
 * only — never writes to that table or any other.
 */
export async function sweepOrphanedPhotographerUploads({
  dryRun,
}: {
  dryRun: boolean;
}): Promise<SweepResult> {
  const result: SweepResult = {
    dryRun,
    scanned: 0,
    candidates: 0,
    deleted: 0,
    skipped: 0,
    failed: 0,
  };

  // 1. List objects under photographers/, paginated, bounded.
  const listed: { key: string; lastModified: Date | undefined }[] = [];
  let continuationToken: string | undefined;
  try {
    do {
      const page = await r2Client.send(
        new ListObjectsV2Command({
          Bucket: R2_BUCKET_NAME,
          Prefix: "photographers/",
          MaxKeys: Math.min(1000, MAX_OBJECTS_PER_SWEEP - listed.length),
          ContinuationToken: continuationToken,
        }),
      );
      for (const obj of page.Contents ?? []) {
        if (obj.Key) listed.push({ key: obj.Key, lastModified: obj.LastModified });
      }
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken && listed.length < MAX_OBJECTS_PER_SWEEP);
  } catch (err) {
    // Listing failure: fail the sweep safely. No deletion is ever attempted
    // without a successful listing to check candidates against.
    console.error("[r2-orphan-sweep] listing failed:", err instanceof Error ? err.message : "unknown error");
    throw new Error("R2 listing failed; sweep aborted, no deletions attempted.");
  }
  result.scanned = listed.length;

  // 2. Keep only well-formed photographer keys old enough to be eligible.
  const now = Date.now();
  const eligible: { key: string; photographerId: string }[] = [];
  for (const { key, lastModified } of listed) {
    const match = PHOTOGRAPHER_KEY_PATTERN.exec(key);
    if (!match) continue; // malformed / unrecognized shape — never a candidate
    if (!lastModified || now - lastModified.getTime() < GRACE_PERIOD_MS) continue; // too recent
    eligible.push({ key, photographerId: match[1] });
  }

  // 3. Batched DB cross-check — the database is the sole ownership record.
  // A key found in ANY photographer_photo_submissions row is never a
  // candidate, regardless of that row's status or r2_deletion_status.
  const supabase = createAdminClient();
  const ownedKeys = new Set<string>();
  for (let i = 0; i < eligible.length; i += DB_CHECK_BATCH_SIZE) {
    const chunkKeys = eligible.slice(i, i + DB_CHECK_BATCH_SIZE).map((e) => e.key);
    const { data, error } = await supabase
      .from("photographer_photo_submissions")
      .select("storage_key")
      .in("storage_key", chunkKeys);

    if (error) {
      // Fail closed: a batch we couldn't verify is treated as fully owned
      // (excluded from candidates) rather than risking deletion of
      // something we failed to check.
      console.error("[r2-orphan-sweep] db cross-check failed:", error.message);
      chunkKeys.forEach((k) => ownedKeys.add(k));
      continue;
    }
    for (const row of data ?? []) ownedKeys.add(row.storage_key);
  }

  const orphanCandidates = eligible.filter((e) => !ownedKeys.has(e.key));
  result.candidates = orphanCandidates.length;

  if (dryRun) {
    result.candidateKeys = orphanCandidates.map((c) => c.key);
    return result;
  }

  // 4. Delete each candidate. One failure never aborts the remaining batch.
  // Immediately before each delete, re-check that single key in isolation —
  // narrows (does not eliminate, since no distributed lock exists) the
  // window where a submission could have been inserted after the batch
  // check above but before this specific delete.
  for (const candidate of orphanCandidates) {
    const { data: nowOwnedRow, error: recheckError } = await supabase
      .from("photographer_photo_submissions")
      .select("storage_key")
      .eq("storage_key", candidate.key)
      .maybeSingle();

    if (recheckError) {
      result.failed += 1;
      continue;
    }
    if (nowOwnedRow) {
      // A submission row landed since the batch check — no longer an orphan.
      result.skipped += 1;
      continue;
    }

    // Reuses the same bucket/namespace/key validation as the Phase 11
    // rejection-cleanup path — a resolved { ok: true } already covers the
    // object having disappeared between listing and this delete call, since
    // S3-compatible DeleteObject does not error on an absent key.
    const deletion = await deletePhotographerSubmissionObject({
      storageKey: candidate.key,
      storageBucket: R2_BUCKET_NAME,
      photographerId: candidate.photographerId,
    });

    if (deletion.ok) {
      result.deleted += 1;
    } else {
      result.failed += 1;
      console.error("[r2-orphan-sweep] delete failed:", { key: candidate.key, reason: deletion.reason });
    }
  }

  return result;
}
