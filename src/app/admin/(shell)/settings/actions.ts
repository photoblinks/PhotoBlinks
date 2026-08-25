"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateHeroImage(formData: FormData) {
  const supabase = await createClient();
  const heroImageUrl = String(formData.get("hero_image_url") ?? "").trim() || null;

  const { error } = await supabase
    .from("site_settings")
    .update({ hero_image_url: heroImageUrl })
    .eq("id", true);

  if (error) {
    redirect(`/admin/settings?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/settings");
  revalidatePath("/");
  redirect("/admin/settings?saved=1");
}
