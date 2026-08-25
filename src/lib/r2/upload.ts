import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2Client, R2_BUCKET_NAME } from "./client";

const PRESIGNED_URL_TTL_SECONDS = 300;

/**
 * Generates a short-lived presigned PUT URL so the admin's browser can
 * upload an image directly to R2, bypassing Vercel's function body-size
 * limits. Call only from server code guarded by an admin session check.
 */
export async function createPresignedUploadUrl(key: string, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(r2Client, command, {
    expiresIn: PRESIGNED_URL_TTL_SECONDS,
  });

  const publicUrl = `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/${key}`;

  return { uploadUrl, publicUrl };
}

/** locations/{slug}/{filename} or studios/{slug}/{filename} per the R2 layout convention. */
export function buildImageKey(kind: "locations" | "studios", slug: string, filename: string) {
  return `${kind}/${slug}/${filename}`;
}
