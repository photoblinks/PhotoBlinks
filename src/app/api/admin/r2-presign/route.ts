import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthorizedAdminUser } from "@/lib/supabase/require-admin";
import {
  ALLOWED_IMAGE_CONTENT_TYPES,
  MAX_UPLOAD_BYTES,
  buildImageKey,
  createPresignedUploadUrl,
} from "@/lib/r2/upload";

const bodySchema = z.object({
  kind: z.enum(["locations", "studios", "categories", "site"]),
  slug: z.string().min(1),
  filename: z.string().min(1),
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
  const admin = await getAuthorizedAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const { kind, slug, filename, contentType, fileSize } = parsed.data;
  const key = buildImageKey(kind, slug, `${Date.now()}-${filename}`);
  const { uploadUrl, publicUrl } = await createPresignedUploadUrl(key, contentType, fileSize);

  return NextResponse.json({ uploadUrl, publicUrl });
}
