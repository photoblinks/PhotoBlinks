import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthorizedAdminUser } from "@/lib/supabase/require-admin";
import { getAuthorizedStaffUser, PERMISSION } from "@/lib/supabase/require-permission";
import {
  ALLOWED_IMAGE_CONTENT_TYPES,
  MAX_UPLOAD_BYTES,
  buildImageKey,
  createPresignedUploadUrl,
} from "@/lib/r2/upload";

const bodySchema = z.object({
  kind: z.enum(["locations", "studios", "categories", "countries", "states", "cities", "site", "photographers", "blog"]),
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

// Blog-only hardening (other kinds keep their existing validation
// unchanged). The blog slug becomes a path segment of the R2 key and the
// original filename becomes part of the key itself —
// blog/{slug}/{epoch-ms}-{filename} — so both must match the strict,
// code-fixed blog key shape (see BLOG_IMAGE_KEY_PATTERN / the blog orphan
// sweep) or the upload would create a key the sweep can never recognize,
// or worse, one that escapes the blog/{slug}/ prefix entirely.
const blogSlugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9-]+$/, "Invalid blog slug — use lowercase letters, numbers, and hyphens only.");

const blogFilenameSchema = z
  .string()
  .min(1)
  .max(255)
  .refine(
    (name) => !name.includes("/") && !name.includes("\\") && !name.includes(".."),
    "Filename must be a plain file name (no paths).",
  )
  .refine(
    (name) => /\.(jpg|jpeg|png|webp)$/i.test(name),
    "Filename must end in .jpg, .jpeg, .png, or .webp.",
  );

export async function POST(request: Request) {
  // First check for admin (preserves existing admin behavior for all namespaces)
  const admin = await getAuthorizedAdminUser();
  
  // If not admin, check for employee with appropriate permission
  let staff = null;
  if (!admin) {
    staff = await getAuthorizedStaffUser();
  }

  // No valid session or user is neither admin nor active employee
  if (!admin && !staff) {
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

  // Determine required permission based on kind (server-side, never trust client)
  let hasPermission = false;
  if (admin) {
    // Admins have access to all namespaces
    hasPermission = true;
  } else if (staff) {
    // Employees: only locations.edit for locations, studios.edit for studios
    // All other namespaces remain admin-only
    switch (kind) {
      case "locations":
        hasPermission = staff.can(PERMISSION.LOCATIONS_EDIT);
        break;
      case "studios":
        hasPermission = staff.can(PERMISSION.STUDIOS_EDIT);
        break;
      default:
        // categories, countries, states, cities, site, photographers, blog - admin only
        hasPermission = false;
        break;
    }
  }

  if (!hasPermission) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Blog uploads only: apply the stricter, kind-specific slug/filename
  // checks (the shared minimum-length checks above don't protect the R2 key
  // shape). All other upload kinds continue exactly as before.
  if (kind === "blog") {
    const blogInputs = z.object({ slug: blogSlugSchema, filename: blogFilenameSchema }).safeParse({ slug, filename });
    if (!blogInputs.success) {
      return NextResponse.json(
        { error: blogInputs.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 },
      );
    }
  }

  const key = buildImageKey(kind, slug, `${Date.now()}-${filename}`);
  const { uploadUrl, publicUrl } = await createPresignedUploadUrl(key, contentType, fileSize);

  return NextResponse.json({ uploadUrl, publicUrl });
}
