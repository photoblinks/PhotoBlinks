"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedAdminUser } from "@/lib/supabase/require-admin";
import { slugify } from "@/lib/slug";

const categorySchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200),
  slug: z.string().trim().min(1, "Slug is required.").max(200),
  description: z.string().trim().max(2000).optional(),
  sort_order: z.coerce.number().int().default(0),
  is_active: z.boolean(),
});

function parseBlogCategoryForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim();

  return categorySchema.parse({
    name,
    slug: slugInput ? slugify(slugInput) : slugify(name),
    description: String(formData.get("description") ?? "").trim() || undefined,
    sort_order: formData.get("sort_order") ?? 0,
    is_active: formData.get("is_active") !== null,
  });
}

export async function createBlogCategory(formData: FormData) {
  const admin = await getAuthorizedAdminUser();
  if (!admin) redirect("/admin/login");

  let values: ReturnType<typeof parseBlogCategoryForm>;
  try {
    values = parseBlogCategoryForm(formData);
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues[0].message : "Invalid form data.";
    redirect(`/admin/blog/categories/new?error=${encodeURIComponent(message)}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("blog_categories").insert(values);

  if (error) {
    redirect(`/admin/blog/categories/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/blog/categories");
  redirect("/admin/blog/categories");
}

export async function updateBlogCategory(id: string, formData: FormData) {
  const admin = await getAuthorizedAdminUser();
  if (!admin) redirect("/admin/login");

  let values: ReturnType<typeof parseBlogCategoryForm>;
  try {
    values = parseBlogCategoryForm(formData);
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues[0].message : "Invalid form data.";
    redirect(`/admin/blog/categories/${id}/edit?error=${encodeURIComponent(message)}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("blog_categories").update(values).eq("id", id);

  if (error) {
    redirect(`/admin/blog/categories/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/blog/categories");
  redirect("/admin/blog/categories");
}

export async function toggleBlogCategoryActive(id: string, nextValue: boolean) {
  const admin = await getAuthorizedAdminUser();
  if (!admin) redirect("/admin/login");

  const supabase = await createClient();
  await supabase.from("blog_categories").update({ is_active: nextValue }).eq("id", id);
  revalidatePath("/admin/blog/categories");
}

export async function deleteBlogCategory(id: string) {
  const admin = await getAuthorizedAdminUser();
  if (!admin) redirect("/admin/login");

  const supabase = await createClient();

  // category_id is ON DELETE RESTRICT on blog_posts — deactivate instead of
  // a destructive delete when posts still reference this category.
  const { count } = await supabase
    .from("blog_posts")
    .select("*", { count: "exact", head: true })
    .eq("category_id", id);

  if (count && count > 0) {
    await supabase.from("blog_categories").update({ is_active: false }).eq("id", id);
  } else {
    await supabase.from("blog_categories").delete().eq("id", id);
  }

  revalidatePath("/admin/blog/categories");
}
