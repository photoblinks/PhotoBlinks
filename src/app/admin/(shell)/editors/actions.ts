"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CACHE_TAGS } from "@/lib/public-data";
import { revalidatePublicContent } from "@/lib/revalidate-public";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedAdminUser } from "@/lib/supabase/require-admin";
import { isAllowedR2ImageUrl } from "@/lib/r2/upload";
import { slugify } from "@/lib/slug";

const optionalUrl = (message: string) =>
  z.union([
    z.literal("").transform(() => null),
    z
      .string()
      .trim()
      .max(500)
      .url(message)
      .refine((value) => value.startsWith("https://"), message),
  ]);

const editorSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  slug: z.string().trim().min(1, "Slug is required.").max(120),
  role_title: z.string().trim().max(150),
  bio: z.string().trim().max(2000, "Bio must be 2000 characters or fewer."),
  image_url: z.union([
    z.literal("").transform(() => null),
    z.string().trim().url().refine(isAllowedR2ImageUrl, "Image must be hosted on the PhotoBlinks R2 bucket."),
  ]),
  instagram_url: optionalUrl("Enter a valid Instagram URL (https)."),
  youtube_url: optionalUrl("Enter a valid YouTube URL (https)."),
  x_url: optionalUrl("Enter a valid X URL (https)."),
  linkedin_url: optionalUrl("Enter a valid LinkedIn URL (https)."),
  facebook_url: optionalUrl("Enter a valid Facebook URL (https)."),
  website_url: optionalUrl("Enter a valid website URL (https)."),
  is_default: z.boolean(),
});

function parseEditorForm(formData: FormData) {
  const get = (key: string) => String(formData.get(key) ?? "").trim();
  const name = get("name");
  return editorSchema.parse({
    name,
    slug: slugify(get("slug") || name),
    role_title: get("role_title"),
    bio: get("bio"),
    image_url: get("image_url"),
    instagram_url: get("instagram_url"),
    youtube_url: get("youtube_url"),
    x_url: get("x_url"),
    linkedin_url: get("linkedin_url"),
    facebook_url: get("facebook_url"),
    website_url: get("website_url"),
    is_default: formData.get("is_default") !== null,
  });
}

function messageOf(error: unknown) {
  return error instanceof z.ZodError ? (error.issues[0]?.message ?? "Invalid input.") : "Invalid input.";
}

/** Only one default editor may exist: clear the flag elsewhere first. */
async function clearOtherDefaults(supabase: Awaited<ReturnType<typeof createClient>>, exceptId?: string) {
  let query = supabase.from("editors").update({ is_default: false }).eq("is_default", true);
  if (exceptId) query = query.neq("id", exceptId);
  await query;
}

function refresh() {
  revalidatePublicContent(CACHE_TAGS.blog, "location-editorial");
  revalidatePath("/admin/editors");
}

function rowFrom(values: z.infer<typeof editorSchema>) {
  return {
    ...values,
    role_title: values.role_title || null,
    bio: values.bio || null,
  };
}

export async function createEditor(formData: FormData) {
  if (!(await getAuthorizedAdminUser())) redirect("/admin/login");

  let values: z.infer<typeof editorSchema>;
  try {
    values = parseEditorForm(formData);
  } catch (error) {
    redirect(`/admin/editors/new?error=${encodeURIComponent(messageOf(error))}`);
  }

  const supabase = await createClient();
  if (values.is_default) await clearOtherDefaults(supabase);
  const { error } = await supabase.from("editors").insert(rowFrom(values));
  if (error) {
    const message = error.code === "23505" ? "An editor with this slug already exists." : error.message;
    redirect(`/admin/editors/new?error=${encodeURIComponent(message)}`);
  }

  refresh();
  redirect("/admin/editors");
}

export async function updateEditor(id: string, formData: FormData) {
  if (!z.string().uuid().safeParse(id).success) redirect("/admin/editors");
  if (!(await getAuthorizedAdminUser())) redirect("/admin/login");

  let values: z.infer<typeof editorSchema>;
  try {
    values = parseEditorForm(formData);
  } catch (error) {
    redirect(`/admin/editors/${id}/edit?error=${encodeURIComponent(messageOf(error))}`);
  }

  const supabase = await createClient();
  if (values.is_default) await clearOtherDefaults(supabase, id);
  const { error } = await supabase.from("editors").update(rowFrom(values)).eq("id", id);
  if (error) {
    const message = error.code === "23505" ? "An editor with this slug already exists." : error.message;
    redirect(`/admin/editors/${id}/edit?error=${encodeURIComponent(message)}`);
  }

  refresh();
  redirect("/admin/editors");
}

export async function deleteEditor(id: string) {
  if (!z.string().uuid().safeParse(id).success) redirect("/admin/editors");
  if (!(await getAuthorizedAdminUser())) redirect("/admin/login");

  const supabase = await createClient();
  const { error } = await supabase.from("editors").delete().eq("id", id);
  if (error) redirect(`/admin/editors?error=${encodeURIComponent(error.message)}`);

  refresh();
  redirect("/admin/editors");
}
