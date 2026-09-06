"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Permissive enough for a real Indian mobile number with or without a "+91"
// country code, spaces, or dashes — not a strict E.164 validator, just a
// guard against obviously-wrong input.
const PHONE_REGEX = /^[\d+\s-]{7,20}$/;

const photographerSchema = z.object({
  photography_name: z.string().trim().min(1, "Photography name is required."),
  image_url: z.string().trim().url("An image is required."),
  title: z.string().trim().min(1, "Title is required."),
  description: z.string().trim().optional(),
  phone_number: z.string().trim().regex(PHONE_REGEX, "Enter a valid phone number."),
  whatsapp_number: z.string().trim().regex(PHONE_REGEX, "Enter a valid WhatsApp number."),
  state_id: z.string().trim().min(1, "State is required."),
  expiry_date: z.string().trim().min(1, "Expiry date is required."),
});

function parsePhotographerForm(formData: FormData) {
  const raw = {
    photography_name: String(formData.get("photography_name") ?? ""),
    image_url: String(formData.get("image_url") ?? ""),
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? "").trim() || undefined,
    phone_number: String(formData.get("phone_number") ?? ""),
    whatsapp_number: String(formData.get("whatsapp_number") ?? ""),
    state_id: String(formData.get("state_id") ?? ""),
    expiry_date: String(formData.get("expiry_date") ?? ""),
  };

  return photographerSchema.parse(raw);
}

export async function createPhotographer(formData: FormData) {
  const supabase = await createClient();

  let values: ReturnType<typeof parsePhotographerForm>;
  try {
    values = parsePhotographerForm(formData);
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues[0].message : "Invalid form data.";
    redirect(`/admin/photographers/new?error=${encodeURIComponent(message)}`);
  }

  const { error } = await supabase.from("sponsored_photographers").insert(values);

  if (error) {
    // Covers both the state-uniqueness trigger's rejection and any other DB
    // error — surfaced verbatim since the trigger's message is already
    // written for an admin audience (see the migration).
    redirect(`/admin/photographers/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/photographers");
  redirect("/admin/photographers");
}

export async function updatePhotographer(id: string, formData: FormData) {
  const supabase = await createClient();

  let values: ReturnType<typeof parsePhotographerForm>;
  try {
    values = parsePhotographerForm(formData);
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues[0].message : "Invalid form data.";
    redirect(`/admin/photographers/${id}/edit?error=${encodeURIComponent(message)}`);
  }

  const { error } = await supabase.from("sponsored_photographers").update(values).eq("id", id);

  if (error) {
    redirect(`/admin/photographers/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/photographers");
  redirect("/admin/photographers");
}

export async function deletePhotographer(id: string) {
  const supabase = await createClient();
  // No incoming FK references a photographer row, so a direct delete is
  // safe (same reasoning as deleteLocation) — historical/expired records
  // are kept intentionally (see the admin list), deletion is opt-in only.
  await supabase.from("sponsored_photographers").delete().eq("id", id);
  revalidatePath("/admin/photographers");
}
