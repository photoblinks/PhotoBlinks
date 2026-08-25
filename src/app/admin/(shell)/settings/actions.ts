"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateBannerImages(formData: FormData) {
  const supabase = await createClient();
  const images = formData.getAll("images").map(String).filter(Boolean);

  // Atomic: either every image lands with the right sort_order, or nothing
  // changes — see 20260826000000_replace_site_banner_images_fn.sql.
  const { error } = await supabase.rpc("replace_site_banner_images", { image_urls: images });

  if (error) {
    redirect(`/admin/settings?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/settings");
  revalidatePath("/");
  redirect("/admin/settings?saved=1");
}
