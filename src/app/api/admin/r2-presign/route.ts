import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { buildImageKey, createPresignedUploadUrl } from "@/lib/r2/upload";

const bodySchema = z.object({
  kind: z.enum(["locations", "studios", "categories", "site"]),
  slug: z.string().min(1),
  filename: z.string().min(1),
  contentType: z.string().min(1),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { kind, slug, filename, contentType } = parsed.data;
  const key = buildImageKey(kind, slug, `${Date.now()}-${filename}`);
  const { uploadUrl, publicUrl } = await createPresignedUploadUrl(key, contentType);

  return NextResponse.json({ uploadUrl, publicUrl });
}
