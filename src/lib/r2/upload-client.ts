"use client";

/** Uploads a single file to R2 via a presigned URL and returns its public URL.
 * Client-side only — calls the admin-gated /api/admin/r2-presign endpoint. */
export async function uploadFileToR2(
  kind: "categories" | "locations" | "studios" | "site",
  slug: string,
  file: File,
) {
  const presignRes = await fetch("/api/admin/r2-presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind,
      slug,
      filename: file.name,
      contentType: file.type,
      fileSize: file.size,
    }),
  });
  if (!presignRes.ok) {
    const body = await presignRes.json().catch(() => null);
    throw new Error(body?.error ?? "Could not get an upload URL.");
  }
  const { uploadUrl, publicUrl } = await presignRes.json();

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!putRes.ok) throw new Error("Upload to storage failed.");

  return publicUrl as string;
}
