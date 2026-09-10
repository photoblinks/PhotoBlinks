import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthorizedPhotographerUser } from "@/lib/supabase/require-photographer";
import {
  ALLOWED_IMAGE_CONTENT_TYPES,
  MAX_UPLOAD_BYTES,
  buildImageKey,
  createPresignedUploadUrl,
} from "@/lib/r2/upload";

// Maps validated content-types to file extensions.
// Extension is always derived server-side from the validated type —
// the client never supplies a filename, so path traversal is impossible.
const CONTENT_TYPE_EXT: Record<(typeof ALLOWED_IMAGE_CONTENT_TYPES)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const bodySchema = z.object({
  contentType: z.enum(ALLOWED_IMAGE_CONTENT_TYPES, {
    message: "Unsupported file type. Only JPEG, PNG, and WebP images are allowed.",
  }),
  fileSize: z
    .number()
    .int()
    .positive()
    .max(MAX_UPLOAD_BYTES, { message: "File is too large. Maximum size is 10MB." }),
});

export async function POST(request: Request) {
  // Only active photographers may presign — suspended photographers are rejected.
  // photographerId is always the authenticated session user id; never from the body.
  const photographer = await getAuthorizedPhotographerUser();
  if (!photographer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const { contentType, fileSize } = parsed.data;

  // Key is fully server-constructed:
  // - namespace ("photographers") is fixed
  // - owner segment is the authenticated user's id (never client-supplied)
  // - filename is derived from the validated contentType (no client filename accepted)
  // This prevents path traversal, cross-photographer namespace access,
  // and arbitrary key injection.
  const ext = CONTENT_TYPE_EXT[contentType];
  const storageKey = buildImageKey("photographers", photographer.id, `${Date.now()}.${ext}`);

  const { uploadUrl, publicUrl } = await createPresignedUploadUrl(storageKey, contentType, fileSize);

  // storageKey is returned alongside publicUrl so the submission phase can
  // persist the exact R2 object key without reconstructing it from the URL.
  return NextResponse.json({ uploadUrl, publicUrl, storageKey });
}
