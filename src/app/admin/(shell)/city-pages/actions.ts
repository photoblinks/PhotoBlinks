"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function parseGeoPageForm(formData: FormData) {
  return {
    image_url: String(formData.get("image_url") ?? "").trim() || null,
    h1_title: String(formData.get("h1_title") ?? "").trim() || null,
    meta_title: String(formData.get("meta_title") ?? "").trim() || null,
    meta_description: String(formData.get("meta_description") ?? "").trim() || null,
  };
}

export async function updateCityPage(id: string, formData: FormData) {
  const supabase = await createClient();
  const values = parseGeoPageForm(formData);

  const { error } = await supabase.from("cities").update(values).eq("id", id);

  if (error) {
    redirect(`/admin/city-pages/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/city-pages");
  redirect("/admin/city-pages");
}
