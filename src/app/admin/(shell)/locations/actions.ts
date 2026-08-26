"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveLocationGeo } from "@/lib/admin-geo";
import { slugify } from "@/lib/slug";

const locationSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required."),
    slug: z.string().trim().min(1),
    description: z.string().trim().optional(),
    category_id: z.string().trim().min(1, "Category is required."),
    country_id: z.string().trim().min(1, "Country is required."),
    state_id: z.string().trim().min(1, "State is required."),
    city_name: z.string().trim().min(1, "City is required."),
    pricing_type: z.enum(["free", "paid", "unknown"]),
    price: z.coerce.number().optional(),
    map_url: z.string().trim().optional(),
    latitude: z.coerce.number().optional(),
    longitude: z.coerce.number().optional(),
    youtube_url: z.string().trim().optional(),
    drone_status: z.enum(["allowed", "restricted", "conditional"]).optional(),
    entry_fee: z.string().trim().optional(),
    best_season: z.string().trim().optional(),
    best_time: z.string().trim().optional(),
    crowd: z.string().trim().optional(),
    access: z.string().trim().optional(),
    privacy: z.string().trim().optional(),
    is_published: z.boolean(),
    images: z.array(z.string().url()).default([]),
  })
  .refine((data) => data.pricing_type !== "paid" || (data.price !== undefined && data.price > 0), {
    message: "Price is required when pricing is Paid.",
    path: ["price"],
  });

function parseLocationForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim();

  const raw = {
    name,
    slug: slugInput ? slugify(slugInput) : slugify(name),
    description: String(formData.get("description") ?? "").trim() || undefined,
    category_id: String(formData.get("category_id") ?? ""),
    country_id: String(formData.get("country_id") ?? ""),
    state_id: String(formData.get("state_id") ?? ""),
    city_name: String(formData.get("city_name") ?? "").trim(),
    pricing_type: String(formData.get("pricing_type") ?? "unknown"),
    price: formData.get("price") ? Number(formData.get("price")) : undefined,
    map_url: String(formData.get("map_url") ?? "").trim() || undefined,
    latitude: formData.get("latitude") ? Number(formData.get("latitude")) : undefined,
    longitude: formData.get("longitude") ? Number(formData.get("longitude")) : undefined,
    youtube_url: String(formData.get("youtube_url") ?? "").trim() || undefined,
    drone_status: String(formData.get("drone_status") ?? "").trim() || undefined,
    entry_fee: String(formData.get("entry_fee") ?? "").trim() || undefined,
    best_season: String(formData.get("best_season") ?? "").trim() || undefined,
    best_time: String(formData.get("best_time") ?? "").trim() || undefined,
    crowd: String(formData.get("crowd") ?? "").trim() || undefined,
    access: String(formData.get("access") ?? "").trim() || undefined,
    privacy: String(formData.get("privacy") ?? "").trim() || undefined,
    is_published: formData.get("is_published") !== null,
    images: formData.getAll("images").map(String).filter(Boolean),
  };

  return locationSchema.parse(raw);
}

async function replaceLocationImages(
  supabase: Awaited<ReturnType<typeof createClient>>,
  locationId: string,
  imageUrls: string[],
) {
  await supabase.from("location_images").delete().eq("location_id", locationId);
  if (imageUrls.length === 0) return;

  await supabase.from("location_images").insert(
    imageUrls.map((image_url, index) => ({
      location_id: locationId,
      image_url,
      sort_order: index,
    })),
  );
}

export async function createLocation(formData: FormData) {
  const supabase = await createClient();

  let values: ReturnType<typeof parseLocationForm>;
  try {
    values = parseLocationForm(formData);
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues[0].message : "Invalid form data.";
    redirect(`/admin/locations/new?error=${encodeURIComponent(message)}`);
  }

  const { images, city_name, ...locationValues } = values;

  const cityId = await resolveLocationGeo(supabase, {
    countryId: locationValues.country_id,
    stateId: locationValues.state_id,
    cityName: city_name,
    errorRedirectPath: "/admin/locations/new",
  });

  const { data, error } = await supabase
    .from("locations")
    .insert({ ...locationValues, city_id: cityId })
    .select()
    .single();

  if (error) {
    redirect(`/admin/locations/new?error=${encodeURIComponent(error.message)}`);
  }

  await replaceLocationImages(supabase, data.id, images);

  revalidatePath("/admin/locations");
  redirect("/admin/locations");
}

export async function updateLocation(id: string, formData: FormData) {
  const supabase = await createClient();

  let values: ReturnType<typeof parseLocationForm>;
  try {
    values = parseLocationForm(formData);
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues[0].message : "Invalid form data.";
    redirect(`/admin/locations/${id}/edit?error=${encodeURIComponent(message)}`);
  }

  const { images, city_name, ...locationValues } = values;

  const cityId = await resolveLocationGeo(supabase, {
    countryId: locationValues.country_id,
    stateId: locationValues.state_id,
    cityName: city_name,
    errorRedirectPath: `/admin/locations/${id}/edit`,
  });

  const { error } = await supabase
    .from("locations")
    .update({ ...locationValues, city_id: cityId })
    .eq("id", id);

  if (error) {
    redirect(`/admin/locations/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  await replaceLocationImages(supabase, id, images);

  revalidatePath("/admin/locations");
  redirect("/admin/locations");
}

export async function toggleLocationPublished(id: string, nextValue: boolean) {
  const supabase = await createClient();
  await supabase.from("locations").update({ is_published: nextValue }).eq("id", id);
  revalidatePath("/admin/locations");
}

export async function deleteLocation(id: string) {
  const supabase = await createClient();
  // Nothing references a location as a foreign key (location_images cascades
  // on delete), so unlike categories there's no "in use" case to guard —
  // a straightforward delete is safe. Publish/unpublish covers the
  // reversible/soft case.
  await supabase.from("locations").delete().eq("id", id);
  revalidatePath("/admin/locations");
}
