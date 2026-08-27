"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/slug";

function parseCategoryForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const image_url = String(formData.get("image_url") ?? "").trim() || null;
  const sort_order = Number(formData.get("sort_order") ?? 0) || 0;
  const is_active = formData.get("is_active") !== null;
  const h1_title = String(formData.get("h1_title") ?? "").trim() || null;
  const meta_title = String(formData.get("meta_title") ?? "").trim() || null;
  const meta_description = String(formData.get("meta_description") ?? "").trim() || null;

  return {
    name,
    slug: slugInput ? slugify(slugInput) : slugify(name),
    description,
    image_url,
    sort_order,
    is_active,
    h1_title,
    meta_title,
    meta_description,
  };
}

export async function createCategory(formData: FormData) {
  const supabase = await createClient();
  const values = parseCategoryForm(formData);

  const { error } = await supabase.from("categories").insert(values);

  if (error) {
    redirect(`/admin/categories/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/categories");
  redirect("/admin/categories");
}

export async function updateCategory(id: string, formData: FormData) {
  const supabase = await createClient();
  const values = parseCategoryForm(formData);

  const { error } = await supabase.from("categories").update(values).eq("id", id);

  if (error) {
    redirect(`/admin/categories/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/categories");
  redirect("/admin/categories");
}

export async function toggleCategoryActive(id: string, nextValue: boolean) {
  const supabase = await createClient();
  await supabase.from("categories").update({ is_active: nextValue }).eq("id", id);
  revalidatePath("/admin/categories");
}

export async function deleteCategory(id: string) {
  const supabase = await createClient();

  const { count } = await supabase
    .from("locations")
    .select("*", { count: "exact", head: true })
    .eq("category_id", id);

  if (count && count > 0) {
    // In use — deactivate instead of a destructive delete.
    await supabase.from("categories").update({ is_active: false }).eq("id", id);
  } else {
    await supabase.from("categories").delete().eq("id", id);
  }

  revalidatePath("/admin/categories");
}
