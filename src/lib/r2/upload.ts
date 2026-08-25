import { PutObjectCommand } from "@aws-sdk/client-s3";
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

/** locations/{slug}/{filename}, studios/{slug}/{filename}, categories/{slug}/{filename}, or site/{slug}/{filename}. */
export function buildImageKey(
  kind: "locations" | "studios" | "categories" | "site",
  slug: string,
  filename: string,
) {
  return `${kind}/${slug}/${filename}`;
}
