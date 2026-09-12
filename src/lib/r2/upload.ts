import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2Client, R2_BUCKET_NAME } from "./client";

const PRESIGNED_URL_TTL_SECONDS = 300;

/** Image types PhotoBlinks accepts for admin uploads (location/studio/
 * category photos and the homepage banner). */
export const ALLOWED_IMAGE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Generous cap for the pre-optimized, high-resolution photos admins upload. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * Generates a short-lived presigned PUT URL so the admin's browser can
 * upload an image directly to R2, bypassing Vercel's function body-size
 * limits. Call only from server code guarded by an admin session check,
 * with a contentType/contentLength already validated against
 * ALLOWED_IMAGE_CONTENT_TYPES / MAX_UPLOAD_BYTES.
 *
 * Content-Type and Content-Length are bound into the signature (via
 * signableHeaders), so the browser's actual PUT request must match what
 * was validated here — a swapped-in larger or different-type file fails
 * signature validation instead of silently uploading.
 */
export async function createPresignedUploadUrl(
  key: string,
  contentType: string,
  contentLength: number,
) {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
  });

  const uploadUrl = await getSignedUrl(r2Client, command, {
    expiresIn: PRESIGNED_URL_TTL_SECONDS,
    signableHeaders: new Set(["content-type", "content-length"]),
  });

  const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;

  return { uploadUrl, publicUrl };
}

/** locations/{slug}/{filename}, studios/{slug}/{filename}, categories/{slug}/{filename}, countries/{slug}/{filename}, states/{slug}/{filename}, cities/{slug}/{filename}, site/{slug}/{filename}, photographers/{slug}/{filename}, or blog/{slug}/{filename}. */
export function buildImageKey(
  kind:
    | "locations"
    | "studios"
    | "categories"
    | "countries"
    | "states"
    | "cities"
    | "site"
    | "photographers"
    | "blog",
  slug: string,
  filename: string,
) {
  return `${kind}/${slug}/${filename}`;
}

/** True only for an https URL whose host matches the configured R2 public
 * host. Used to keep externally-supplied image URLs (blog content blocks,
 * featured_image_url) confined to this account's own R2 bucket instead of
 * accepting an arbitrary third-party image URL. */
export function isAllowedR2ImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const allowed = new URL(process.env.R2_PUBLIC_URL!);
    return parsed.protocol === "https:" && parsed.host === allowed.host;
  } catch {
    return false;
  }
}

/** Key shape written by the admin r2-presign route for blog images:
 * blog/{slug}/{epoch-millis}-{original-filename}. Mirrors the strictness of
 * PHOTOGRAPHER_KEY_PATTERN in orphan-sweep.ts — anything outside this exact
 * shape is left alone. */
const BLOG_IMAGE_KEY_PATTERN = /^blog\/[a-z0-9-]+\/\d+-[^/]+\.(jpg|jpeg|png|webp)$/i;

/**
 * Deletes exactly one blog-post image object. Callers must pass only a
 * storageKey already known to be unreferenced (see blog-orphan-sweep.ts) —
 * this function's only defense is re-validating the key shape and bucket,
 * it does not itself check ownership.
 */
export async function deleteBlogImageObject(storageKey: string): Promise<DeleteResult> {
  if (!BLOG_IMAGE_KEY_PATTERN.test(storageKey) || storageKey.includes("..") || storageKey.includes("\\")) {
    return { ok: false, reason: "invalid_key" };
  }

  try {
    await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: storageKey }));
    return { ok: true };
  } catch {
    return { ok: false, reason: "delete_failed" };
  }
}

export type DeleteResult = { ok: true } | { ok: false; reason: "bucket_mismatch" | "invalid_key" | "delete_failed" };

/**
 * Deletes exactly one photographer submission's R2 object. Callers must
 * pass only trusted values already loaded from the submission's own
 * database row — never a browser-supplied bucket/key/photographer id.
 * There is no caller-suppliable bucket parameter: this account only ever
 * has one configured bucket (R2_BUCKET_NAME), so `storageBucket` is
 * validated against it rather than trusted as a delete target, which rules
 * out this function ever becoming an arbitrary-bucket deletion primitive.
 *
 * `storageKey` is independently re-validated against the given
 * photographer's own `photographers/{photographerId}/` namespace — the
 * same shape enforced at submission time in submit-photo/actions.ts — so a
 * corrupted or tampered database row fails closed (no delete attempted)
 * instead of deleting whatever the key happens to point at.
 *
 * A resolved `{ ok: true }` covers the object already being absent: S3
 * (and R2, which is S3-compatible) DeleteObject does not error on a
 * missing key, so a successful call already satisfies idempotent retry
 * semantics with no special-casing needed.
 */
export async function deletePhotographerSubmissionObject({
  storageKey,
  storageBucket,
  photographerId,
}: {
  storageKey: string;
  storageBucket: string;
  photographerId: string;
}): Promise<DeleteResult> {
  if (storageBucket !== R2_BUCKET_NAME) {
    return { ok: false, reason: "bucket_mismatch" };
  }

  const expectedPrefix = `photographers/${photographerId}/`;
  const keyFilename = storageKey.slice(expectedPrefix.length);
  if (
    !storageKey.startsWith(expectedPrefix) ||
    !keyFilename ||
    keyFilename.includes("/") ||
    keyFilename.includes("..") ||
    storageKey.includes("\\")
  ) {
    return { ok: false, reason: "invalid_key" };
  }

  try {
    await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: storageKey }));
    return { ok: true };
  } catch {
    return { ok: false, reason: "delete_failed" };
  }
}
