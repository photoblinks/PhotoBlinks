"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { CACHE_TAGS } from "@/lib/public-data";
import { revalidatePublicContent } from "@/lib/revalidate-public";
import { createClient } from "@/lib/supabase/server";
import { parseCityQuickFacts } from "@/lib/city-quick-facts";

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
  const quickFacts = parseCityQuickFacts(Object.fromEntries(formData));
  const values = {
    ...parseGeoPageForm(formData),
    quick_facts: Object.keys(quickFacts).length > 0 ? quickFacts : null,
  };

  const { error } = await supabase.from("cities").update(values).eq("id", id);

  if (error) {
    redirect(`/admin/city-pages/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePublicContent(CACHE_TAGS.geo);
  revalidatePath("/admin/city-pages");
  redirect("/admin/city-pages");
}
