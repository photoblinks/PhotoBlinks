"use client";

/** Uploads a single file to R2 for a photographer.
 * Calls the photographer-gated /api/photographer/r2-presign endpoint.
 * Returns both publicUrl (for display) and storageKey (for submission persistence).
 * The server constructs the key — the client does not choose the R2 path. */
export async function uploadPhotographerFileToR2(
  file: File,
): Promise<{ publicUrl: string; storageKey: string }> {
  const presignRes = await fetch("/api/photographer/r2-presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType: file.type, fileSize: file.size }),
  });
  if (!presignRes.ok) {
    const body = await presignRes.json().catch(() => null);
    throw new Error(body?.error ?? "Could not get an upload URL.");
  }
  const { uploadUrl, publicUrl, storageKey } = await presignRes.json();

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!putRes.ok) throw new Error("Upload to storage failed.");

  return { publicUrl: publicUrl as string, storageKey: storageKey as string };
}

/** Uploads a single file to R2 via a presigned URL and returns its public URL.
 * Client-side only — calls the admin-gated /api/admin/r2-presign endpoint. */
export async function uploadFileToR2(
  kind: "categories" | "locations" | "studios" | "countries" | "states" | "cities" | "site" | "photographers" | "blog",
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
