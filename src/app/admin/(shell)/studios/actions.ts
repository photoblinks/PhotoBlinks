"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveLocationGeo } from "@/lib/admin-geo";
import { slugify } from "@/lib/slug";
import { isValidYouTubeUrl } from "@/lib/youtube";

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

const optionalUrl = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.string().trim().url("Must be a valid URL.").optional(),
);

const optionalYoutubeUrl = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z
    .string()
    .trim()
    .refine((v) => isValidYouTubeUrl(v), {
      message: "Must be a valid YouTube video URL (watch, youtu.be, embed, or shorts link).",
    })
    .optional(),
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

const faqSchema = z.object({
  question: z.string().trim().min(1, "FAQ question is required.").max(300, "FAQ question is too long."),
  answer: z.string().trim().min(1, "FAQ answer is required.").max(2000, "FAQ answer is too long."),
});

const studioSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required."),
    card_name: z.string().trim().min(1, "Card Place Name is required."),
    slug: z.string().trim().min(1),
    description: z.string().trim().optional(),
    country_id: z.string().trim().min(1, "Country is required."),
    state_id: z.string().trim().min(1, "State is required."),
    city_name: z.string().trim().min(1, "City is required."),
    map_url: optionalUrl,
    latitude: optionalCoord(-90, 90),
    longitude: optionalCoord(-180, 180),
    youtube_url: optionalYoutubeUrl,
    meta_title: z.string().trim().optional(),
    meta_description: z.string().trim().optional(),
    action_type: z.enum(["book_now", "website", "call_now"]).nullable().optional(),
    action_value: z.string().trim().optional(),
    pre_wedding_shoot: z.enum(["allowed", "conditional", "prohibited"]).nullable().optional(),
    pre_wedding_shoot_condition: z.string().trim().optional(),
    prior_booking: z.string().trim().optional(),
    drone_status: z
      .enum(["allowed", "allowed_with_permission", "restricted", "prohibited"])
      .nullable()
      .optional(),
    drone_permission: z.string().trim().optional(),
    recommended_outfits: z.string().trim().optional(),
    entry_fee: z.string().trim().optional(),
    shoot_permit_fee: z.string().trim().optional(),
    vehicle_parking_fee: z.string().trim().optional(),
    best_season: z.string().trim().optional(),
    best_time: z.string().trim().optional(),
    road_accessibility: z.string().trim().optional(),
    changing_rooms: z.enum(["available", "not_available"]).nullable().optional(),
    parking_facility: z.enum(["available", "not_available"]).nullable().optional(),
    boating_available: z.string().trim().optional(),
    restrooms: z.string().trim().optional(),
    facilities: z.string().trim().optional(),
    crowd: z.string().trim().optional(),
    access: z.string().trim().optional(),
    privacy: z.string().trim().optional(),
    weather_lighting: z.string().trim().optional(),
    is_published: z.boolean(),
    images: z.array(z.string().url()).default([]),
    pricingOptions: z.array(pricingOptionSchema).default([]),
    faqs: z.array(faqSchema).default([]),
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
    card_name: String(formData.get("card_name") ?? "").trim(),
    slug: slugInput ? slugify(slugInput) : slugify(name),
    description: String(formData.get("description") ?? "").trim() || undefined,
    country_id: String(formData.get("country_id") ?? ""),
    state_id: String(formData.get("state_id") ?? ""),
    city_name: String(formData.get("city_name") ?? "").trim(),
    map_url: String(formData.get("map_url") ?? "").trim(),
    latitude: String(formData.get("latitude") ?? "").trim(),
    longitude: String(formData.get("longitude") ?? "").trim(),
    youtube_url: String(formData.get("youtube_url") ?? "").trim(),
    meta_title: String(formData.get("meta_title") ?? "").trim() || undefined,
    meta_description: String(formData.get("meta_description") ?? "").trim() || undefined,
    action_type: optionalField(formData, "action_type"),
    action_value: String(formData.get("action_value") ?? "").trim() || undefined,
    pre_wedding_shoot: optionalField(formData, "pre_wedding_shoot"),
    pre_wedding_shoot_condition:
      String(formData.get("pre_wedding_shoot_condition") ?? "").trim() || undefined,
    prior_booking: String(formData.get("prior_booking") ?? "").trim() || undefined,
    drone_status: optionalField(formData, "drone_status"),
    drone_permission: String(formData.get("drone_permission") ?? "").trim() || undefined,
    recommended_outfits: String(formData.get("recommended_outfits") ?? "").trim() || undefined,
    entry_fee: String(formData.get("entry_fee") ?? "").trim() || undefined,
    shoot_permit_fee: String(formData.get("shoot_permit_fee") ?? "").trim() || undefined,
    vehicle_parking_fee: String(formData.get("vehicle_parking_fee") ?? "").trim() || undefined,
    best_season: String(formData.get("best_season") ?? "").trim() || undefined,
    best_time: String(formData.get("best_time") ?? "").trim() || undefined,
    road_accessibility: String(formData.get("road_accessibility") ?? "").trim() || undefined,
    changing_rooms: optionalField(formData, "changing_rooms"),
    parking_facility: optionalField(formData, "parking_facility"),
    boating_available: String(formData.get("boating_available") ?? "").trim() || undefined,
    restrooms: String(formData.get("restrooms") ?? "").trim() || undefined,
    facilities: String(formData.get("facilities") ?? "").trim() || undefined,
    crowd: String(formData.get("crowd") ?? "").trim() || undefined,
    access: String(formData.get("access") ?? "").trim() || undefined,
    privacy: String(formData.get("privacy") ?? "").trim() || undefined,
    weather_lighting: String(formData.get("weather_lighting") ?? "").trim() || undefined,
    is_published: formData.get("is_published") !== null,
    images: formData.getAll("images").map(String).filter(Boolean),
    pricingOptions,
    faqs: (() => {
      const questions = formData.getAll("faq_question").map(String);
      const answers = formData.getAll("faq_answer").map(String);
      return questions
        .map((question, i) => ({ question: question.trim(), answer: (answers[i] ?? "").trim() }))
        .filter((f) => f.question !== "" || f.answer !== "");
    })(),
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

async function replaceStudioFaqs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studioId: string,
  faqs: { question: string; answer: string }[],
) {
  await supabase.from("studio_faqs").delete().eq("studio_id", studioId);
  if (faqs.length === 0) return;

  await supabase.from("studio_faqs").insert(
    faqs.map((faq, index) => ({
      studio_id: studioId,
      question: faq.question,
      answer: faq.answer,
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

  const { images, pricingOptions, faqs, city_name, ...studioValues } = values;

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
  await replaceStudioFaqs(supabase, data.id, faqs);

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

  const { images, pricingOptions, faqs, city_name, ...studioValues } = values;

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
  await replaceStudioFaqs(supabase, id, faqs);

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
