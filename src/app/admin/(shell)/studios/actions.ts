"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveLocationGeo } from "@/lib/admin-geo";
import { slugify } from "@/lib/slug";

const optionalUrl = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.string().trim().url("Must be a valid URL.").optional(),
);

const optionalCoord = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === "" || v == null ? undefined : Number(v)),
    z.number().min(min, `Must be between ${min} and ${max}.`).max(max, `Must be between ${min} and ${max}.`).optional(),
  );

const pricingOptionSchema = z.object({
  label: z.string().trim().min(1, "Pricing option label is required."),
  price: z.coerce.number().positive("Pricing option price must be a positive number."),
});

const studioSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required."),
    slug: z.string().trim().min(1),
    description: z.string().trim().optional(),
    country_id: z.string().trim().min(1, "Country is required."),
    state_id: z.string().trim().min(1, "State is required."),
    city_name: z.string().trim().min(1, "City is required."),
    map_url: optionalUrl,
    latitude: optionalCoord(-90, 90),
    longitude: optionalCoord(-180, 180),
    youtube_url: optionalUrl,
    action_type: z.enum(["book_now", "website", "call_now"]).optional(),
    action_value: z.string().trim().optional(),
    drone_status: z.enum(["allowed", "restricted", "conditional"]).optional(),
    entry_fee: z.string().trim().optional(),
    best_season: z.string().trim().optional(),
    best_time: z.string().trim().optional(),
    crowd: z.string().trim().optional(),
    access: z.string().trim().optional(),
    privacy: z.string().trim().optional(),
    is_published: z.boolean(),
    images: z.array(z.string().url()).default([]),
    pricingOptions: z.array(pricingOptionSchema).default([]),
  })
  .refine((data) => !data.is_published || data.images.length > 0, {
    message: "At least one image is required before publishing.",
    path: ["images"],
  })
  .refine((data) => !data.is_published || data.pricingOptions.length > 0, {
    message: "At least one pricing option is required before publishing.",
    path: ["pricingOptions"],
  })
  .refine((data) => !data.action_type || !!data.action_value, {
    message: "A URL or phone number is required when an Action Button is selected.",
    path: ["action_value"],
  });

function parseStudioForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim();

  const labels = formData.getAll("pricing_label").map(String);
  const prices = formData.getAll("pricing_price").map(String);
  const pricingOptions = labels
    .map((label, i) => ({ label: label.trim(), price: (prices[i] ?? "").trim() }))
    .filter((o) => o.label !== "" || o.price !== "");

  const raw = {
    name,
    slug: slugInput ? slugify(slugInput) : slugify(name),
    description: String(formData.get("description") ?? "").trim() || undefined,
    country_id: String(formData.get("country_id") ?? ""),
    state_id: String(formData.get("state_id") ?? ""),
    city_name: String(formData.get("city_name") ?? "").trim(),
    map_url: String(formData.get("map_url") ?? "").trim(),
    latitude: String(formData.get("latitude") ?? "").trim(),
    longitude: String(formData.get("longitude") ?? "").trim(),
    youtube_url: String(formData.get("youtube_url") ?? "").trim(),
    action_type: String(formData.get("action_type") ?? "").trim() || undefined,
    action_value: String(formData.get("action_value") ?? "").trim() || undefined,
    drone_status: String(formData.get("drone_status") ?? "").trim() || undefined,
    entry_fee: String(formData.get("entry_fee") ?? "").trim() || undefined,
    best_season: String(formData.get("best_season") ?? "").trim() || undefined,
    best_time: String(formData.get("best_time") ?? "").trim() || undefined,
    crowd: String(formData.get("crowd") ?? "").trim() || undefined,
    access: String(formData.get("access") ?? "").trim() || undefined,
    privacy: String(formData.get("privacy") ?? "").trim() || undefined,
    is_published: formData.get("is_published") !== null,
    images: formData.getAll("images").map(String).filter(Boolean),
    pricingOptions,
  };

  return studioSchema.parse(raw);
}

async function replaceStudioImages(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studioId: string,
  imageUrls: string[],
) {
  await supabase.from("studio_images").delete().eq("studio_id", studioId);
  if (imageUrls.length === 0) return;

  await supabase.from("studio_images").insert(
    imageUrls.map((image_url, index) => ({
      studio_id: studioId,
      image_url,
      sort_order: index,
    })),
  );
}

async function replaceStudioPricingOptions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studioId: string,
  options: { label: string; price: number }[],
) {
  await supabase.from("studio_pricing_options").delete().eq("studio_id", studioId);
  if (options.length === 0) return;

  await supabase.from("studio_pricing_options").insert(
    options.map((option, index) => ({
      studio_id: studioId,
      label: option.label,
      price: option.price,
      sort_order: index,
    })),
  );
}

export async function createStudio(formData: FormData) {
  const supabase = await createClient();

  let values: ReturnType<typeof parseStudioForm>;
  try {
    values = parseStudioForm(formData);
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues[0].message : "Invalid form data.";
    redirect(`/admin/studios/new?error=${encodeURIComponent(message)}`);
  }

  const { images, pricingOptions, city_name, ...studioValues } = values;

  const cityId = await resolveLocationGeo(supabase, {
    countryId: studioValues.country_id,
    stateId: studioValues.state_id,
    cityName: city_name,
    errorRedirectPath: "/admin/studios/new",
  });

  const { data, error } = await supabase
    .from("studios")
    .insert({ ...studioValues, city_id: cityId })
    .select()
    .single();

  if (error) {
    redirect(`/admin/studios/new?error=${encodeURIComponent(error.message)}`);
  }

  await replaceStudioImages(supabase, data.id, images);
  await replaceStudioPricingOptions(supabase, data.id, pricingOptions);

  revalidatePath("/admin/studios");
  redirect("/admin/studios");
}

export async function updateStudio(id: string, formData: FormData) {
  const supabase = await createClient();

  let values: ReturnType<typeof parseStudioForm>;
  try {
    values = parseStudioForm(formData);
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues[0].message : "Invalid form data.";
    redirect(`/admin/studios/${id}/edit?error=${encodeURIComponent(message)}`);
  }

  const { images, pricingOptions, city_name, ...studioValues } = values;

  const cityId = await resolveLocationGeo(supabase, {
    countryId: studioValues.country_id,
    stateId: studioValues.state_id,
    cityName: city_name,
    errorRedirectPath: `/admin/studios/${id}/edit`,
  });

  const { error } = await supabase
    .from("studios")
    .update({ ...studioValues, city_id: cityId })
    .eq("id", id);

  if (error) {
    redirect(`/admin/studios/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  await replaceStudioImages(supabase, id, images);
  await replaceStudioPricingOptions(supabase, id, pricingOptions);

  revalidatePath("/admin/studios");
  redirect("/admin/studios");
}

export async function toggleStudioPublished(id: string, nextValue: boolean) {
  const supabase = await createClient();
  await supabase.from("studios").update({ is_published: nextValue }).eq("id", id);
  revalidatePath("/admin/studios");
}

export async function deleteStudio(id: string) {
  const supabase = await createClient();
  // Nothing references a studio as a foreign key (studio_images and
  // studio_pricing_options cascade on delete), so a straightforward delete
  // is safe — same reasoning as deleteLocation.
  await supabase.from("studios").delete().eq("id", id);
  revalidatePath("/admin/studios");
}
