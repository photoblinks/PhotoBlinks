"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedAdminUser } from "@/lib/supabase/require-admin";
import { slugify } from "@/lib/slug";

const tagSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(100),
  slug: z.string().trim().min(1, "Slug is required.").max(100),
  is_active: z.boolean(),
});

function parseBlogTagForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim();

  return tagSchema.parse({
    name,
    slug: slugInput ? slugify(slugInput) : slugify(name),
    is_active: formData.get("is_active") !== null,
  });
}

export async function createBlogTag(formData: FormData) {
  const admin = await getAuthorizedAdminUser();
  if (!admin) redirect("/admin/login");

  let values: ReturnType<typeof parseBlogTagForm>;
  try {
    values = parseBlogTagForm(formData);
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues[0].message : "Invalid form data.";
    redirect(`/admin/blog/tags/new?error=${encodeURIComponent(message)}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("blog_tags").insert(values);

  if (error) {
    redirect(`/admin/blog/tags/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/blog/tags");
  redirect("/admin/blog/tags");
}

export async function updateBlogTag(id: string, formData: FormData) {
  const admin = await getAuthorizedAdminUser();
  if (!admin) redirect("/admin/login");

  let values: ReturnType<typeof parseBlogTagForm>;
  try {
    values = parseBlogTagForm(formData);
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues[0].message : "Invalid form data.";
    redirect(`/admin/blog/tags/${id}/edit?error=${encodeURIComponent(message)}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("blog_tags").update(values).eq("id", id);

  if (error) {
    redirect(`/admin/blog/tags/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/blog/tags");
  redirect("/admin/blog/tags");
}

export async function toggleBlogTagActive(id: string, nextValue: boolean) {
  const admin = await getAuthorizedAdminUser();
  if (!admin) redirect("/admin/login");

  const supabase = await createClient();
  await supabase.from("blog_tags").update({ is_active: nextValue }).eq("id", id);
  revalidatePath("/admin/blog/tags");
}

export async function deleteBlogTag(id: string) {
  const admin = await getAuthorizedAdminUser();
  if (!admin) redirect("/admin/login");

  const supabase = await createClient();
  // blog_post_tags.tag_id cascades on delete, so no "in use" guard needed.
  await supabase.from("blog_tags").delete().eq("id", id);
  revalidatePath("/admin/blog/tags");
}
