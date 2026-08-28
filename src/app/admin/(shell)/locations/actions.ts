"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveLocationGeo } from "@/lib/admin-geo";
import { slugify } from "@/lib/slug";

// Matches the "Not specified" sentinel item in the Drone Status/Amenities
// dropdowns (see extra-detail-fields.tsx) — picking it clears the field.
// Returns `null` (not `undefined`) in that case: an `undefined` value gets
// dropped entirely from the Supabase update payload (JSON.stringify strips
// undefined keys), which would silently leave the old value in place
// instead of clearing it — `null` is required to actually null the column.
const UNSET = "unspecified";

function optionalField(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) return undefined;
  return value === UNSET ? null : value;
}

const faqSchema = z.object({
  question: z.string().trim().min(1, "FAQ question is required.").max(300, "FAQ question is too long."),
  answer: z.string().trim().min(1, "FAQ answer is required.").max(2000, "FAQ answer is too long."),
});

const locationSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required."),
    card_name: z.string().trim().min(1, "Card Place Name is required."),
    slug: z.string().trim().min(1),
    description: z.string().trim().optional(),
    category_id: z.string().trim().min(1, "Category is required."),
    country_id: z.string().trim().min(1, "Country is required."),
    state_id: z.string().trim().min(1, "State is required."),
    city_name: z.string().trim().min(1, "City is required."),
    pricing_type: z.enum(["free", "paid", "unknown"]),
    price: z.coerce.number().optional(),
    price_note: z.string().trim().optional(),
    meta_title: z.string().trim().optional(),
    meta_description: z.string().trim().optional(),
    action_type: z.enum(["book_now", "website", "call_now"]).nullable().optional(),
    action_value: z.string().trim().optional(),
    map_url: z.string().trim().optional(),
    latitude: z.coerce.number().optional(),
    longitude: z.coerce.number().optional(),
    youtube_url: z.string().trim().optional(),
    pre_wedding_shoot: z.string().trim().optional(),
    prior_booking: z.string().trim().optional(),
    camera_charges: z.string().trim().optional(),
    drone_status: z
      .enum(["allowed", "allowed_with_permission", "restricted", "prohibited"])
      .nullable()
      .optional(),
    entry_fee: z.string().trim().optional(),
    best_season: z.string().trim().optional(),
    best_time: z.string().trim().optional(),
    changing_rooms: z.enum(["available", "not_available"]).nullable().optional(),
    parking_facility: z.enum(["available", "not_available"]).nullable().optional(),
    facilities: z.string().trim().optional(),
    crowd: z.string().trim().optional(),
    access: z.string().trim().optional(),
    privacy: z.string().trim().optional(),
    is_published: z.boolean(),
    images: z.array(z.string().url()).default([]),
    faqs: z.array(faqSchema).default([]),
  })
  .refine((data) => data.pricing_type !== "paid" || (data.price !== undefined && data.price > 0), {
    message: "Price is required when pricing is Paid.",
    path: ["price"],
  })
  .refine((data) => !data.action_type || !!data.action_value, {
    message: "A URL or phone number is required when an Action Button is selected.",
    path: ["action_value"],
  });

function parseLocationForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim();

  const raw = {
    name,
    card_name: String(formData.get("card_name") ?? "").trim(),
    slug: slugInput ? slugify(slugInput) : slugify(name),
    description: String(formData.get("description") ?? "").trim() || undefined,
    category_id: String(formData.get("category_id") ?? ""),
    country_id: String(formData.get("country_id") ?? ""),
    state_id: String(formData.get("state_id") ?? ""),
    city_name: String(formData.get("city_name") ?? "").trim(),
    pricing_type: String(formData.get("pricing_type") ?? "unknown"),
    price: formData.get("price") ? Number(formData.get("price")) : undefined,
    price_note: String(formData.get("price_note") ?? "").trim() || undefined,
    meta_title: String(formData.get("meta_title") ?? "").trim() || undefined,
    meta_description: String(formData.get("meta_description") ?? "").trim() || undefined,
    action_type: optionalField(formData, "action_type"),
    action_value: String(formData.get("action_value") ?? "").trim() || undefined,
    map_url: String(formData.get("map_url") ?? "").trim() || undefined,
    latitude: formData.get("latitude") ? Number(formData.get("latitude")) : undefined,
    longitude: formData.get("longitude") ? Number(formData.get("longitude")) : undefined,
    youtube_url: String(formData.get("youtube_url") ?? "").trim() || undefined,
    pre_wedding_shoot: String(formData.get("pre_wedding_shoot") ?? "").trim() || undefined,
    prior_booking: String(formData.get("prior_booking") ?? "").trim() || undefined,
    camera_charges: String(formData.get("camera_charges") ?? "").trim() || undefined,
    drone_status: optionalField(formData, "drone_status"),
    entry_fee: String(formData.get("entry_fee") ?? "").trim() || undefined,
    best_season: String(formData.get("best_season") ?? "").trim() || undefined,
    best_time: String(formData.get("best_time") ?? "").trim() || undefined,
    changing_rooms: optionalField(formData, "changing_rooms"),
    parking_facility: optionalField(formData, "parking_facility"),
    facilities: String(formData.get("facilities") ?? "").trim() || undefined,
    crowd: String(formData.get("crowd") ?? "").trim() || undefined,
    access: String(formData.get("access") ?? "").trim() || undefined,
    privacy: String(formData.get("privacy") ?? "").trim() || undefined,
    is_published: formData.get("is_published") !== null,
    images: formData.getAll("images").map(String).filter(Boolean),
    faqs: (() => {
      const questions = formData.getAll("faq_question").map(String);
      const answers = formData.getAll("faq_answer").map(String);
      return questions
        .map((question, i) => ({ question: question.trim(), answer: (answers[i] ?? "").trim() }))
        .filter((f) => f.question !== "" || f.answer !== "");
    })(),
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

async function replaceLocationFaqs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  locationId: string,
  faqs: { question: string; answer: string }[],
) {
  await supabase.from("location_faqs").delete().eq("location_id", locationId);
  if (faqs.length === 0) return;

  await supabase.from("location_faqs").insert(
    faqs.map((faq, index) => ({
      location_id: locationId,
      question: faq.question,
      answer: faq.answer,
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

  const { images, faqs, city_name, ...locationValues } = values;

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
  await replaceLocationFaqs(supabase, data.id, faqs);

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

  const { images, faqs, city_name, ...locationValues } = values;

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
  await replaceLocationFaqs(supabase, id, faqs);

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
