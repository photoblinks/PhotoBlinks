import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { r2Client, R2_BUCKET_NAME } from "./client";
import { deleteBlogImageObject } from "./upload";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SweepResult } from "./orphan-sweep";

// Exact key shape written by /api/admin/r2-presign for kind "blog":
// blog/{slug}/{epoch-millis}-{original-filename}.{jpg|jpeg|png|webp}. Same
// strictness policy as PHOTOGRAPHER_KEY_PATTERN in orphan-sweep.ts — anything
// outside this precise shape is never a candidate.
const BLOG_KEY_PATTERN = /^blog\/([a-z0-9-]+)\/(\d+)-([^/]+)\.(jpg|jpeg|png|webp)$/i;

// Same rationale as the photographer sweep: never touch an object younger
// than this, since the admin may still be mid-edit (image uploaded to R2,
// form not yet submitted).
const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

const MAX_OBJECTS_PER_SWEEP = 1000;

/**
 * Finds and (unless dryRun) deletes R2 objects under blog/ that are no
 * longer referenced by any blog_posts row (featured_image_url or an
 * "image"-type block inside content) and are older than GRACE_PERIOD_MS —
 * the orphan left behind when an admin uploads an image (blog CMS uploads
 * straight to R2 before the post form is saved) and then abandons the
 * edit or removes the image before saving.
 *
 * Scope is intentionally narrow, mirroring sweepOrphanedPhotographerUploads:
 * only ever lists/deletes inside the blog/ prefix of the single configured
 * R2_BUCKET_NAME, with the key shape fixed in code. Does not read or write
 * any table other than blog_posts (select-only).
 *
 * Ownership check: unlike the photographer table (one storage_key column),
 * a blog image can be referenced from two places on a post —
 * featured_image_url, or an image block's `url` field inside the content
 * JSONB array. Content is compared as text (content::text ILIKE) rather
 * than parsed per-post, which is sufficient here because a referenced R2
 * public URL always appears verbatim as a JSON string value when present.
 * This assumes the blog_posts table stays small enough to select in full
 * per sweep run (an admin-authored content table, not user-generated at
 * scale) — the same bound the photographer sweep gets from its
 * DB_CHECK_BATCH_SIZE batching, just via one full-table read instead of
 * chunked .in() lookups, since JSONB text search doesn't batch that way.
 */
export async function sweepOrphanedBlogImages({ dryRun }: { dryRun: boolean }): Promise<SweepResult> {
  const result: SweepResult = {
    dryRun,
    scanned: 0,
    candidates: 0,
    deleted: 0,
    skipped: 0,
    failed: 0,
  };

  const listed: { key: string; lastModified: Date | undefined }[] = [];
  let continuationToken: string | undefined;
  try {
    do {
      const page = await r2Client.send(
        new ListObjectsV2Command({
          Bucket: R2_BUCKET_NAME,
          Prefix: "blog/",
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
    console.error("[blog-orphan-sweep] listing failed:", err instanceof Error ? err.message : "unknown error");
    throw new Error("R2 listing failed; sweep aborted, no deletions attempted.");
  }
  result.scanned = listed.length;

  const now = Date.now();
  const eligible: string[] = [];
  for (const { key, lastModified } of listed) {
    if (!BLOG_KEY_PATTERN.test(key)) continue;
    if (!lastModified || now - lastModified.getTime() < GRACE_PERIOD_MS) continue;
    eligible.push(key);
  }

  const supabase = createAdminClient();

  async function isReferenced(key: string): Promise<boolean> {
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;
    const [byFeatured, byContent] = await Promise.all([
      supabase.from("blog_posts").select("id", { count: "exact", head: true }).eq("featured_image_url", publicUrl),
      supabase.from("blog_posts").select("id", { count: "exact", head: true }).ilike("content::text", `%${key}%`),
    ]);
    // Fail closed: if either check errors, treat the key as referenced
    // (never a deletion candidate) rather than risk deleting something we
    // couldn't verify.
    if (byFeatured.error || byContent.error) return true;
    return (byFeatured.count ?? 0) > 0 || (byContent.count ?? 0) > 0;
  }

  const orphanCandidates: string[] = [];
  for (const key of eligible) {
    if (!(await isReferenced(key))) orphanCandidates.push(key);
  }
  result.candidates = orphanCandidates.length;

  if (dryRun) {
    result.candidateKeys = orphanCandidates;
    return result;
  }

  for (const key of orphanCandidates) {
    // Re-check immediately before deleting to narrow the window where a
    // post could have been saved referencing this key after the pass above.
    if (await isReferenced(key)) {
      result.skipped += 1;
      continue;
    }

    const deletion = await deleteBlogImageObject(key);
    if (deletion.ok) {
      result.deleted += 1;
    } else {
      result.failed += 1;
      console.error("[blog-orphan-sweep] delete failed:", { key, reason: deletion.reason });
    }
  }

  return result;
}
