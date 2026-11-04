"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedPhotographerUser } from "@/lib/supabase/require-photographer";
import { CACHE_TAGS } from "@/lib/public-data";
import { revalidatePublicContent } from "@/lib/revalidate-public";
import { isAllowedR2ImageUrl } from "@/lib/r2/upload";
import { MAX_PACKAGES_PER_TYPE, PACKAGE_SERVICES, PACKAGE_TYPES } from "@/lib/photographer-options";

export type PackageFormState = { error?: string };

const optionalCount = (label: string, min: number, max: number) =>
  z
    .number({ invalid_type_error: `${label} must be a number.` })
    .int(`${label} must be a whole number.`)
    .min(min, `${label} must be at least ${min}.`)
    .max(max, `${label} is too large.`)
    .nullable();

const noHtml = (value: string) => !/<\/?[a-z][\s\S]*>/i.test(value);

const packageSchema = z
  .object({
    package_type: z.enum(PACKAGE_TYPES),
    name: z
      .string()
      .trim()
      .min(1, "Package name is required.")
      .max(80, "Package name must be 80 characters or fewer.")
      .refine(noHtml, "HTML tags are not allowed."),
    actual_price: z
      .number({ invalid_type_error: "Actual price must be a number." })
      .int("Actual price must be a whole number.")
      .min(1, "Actual price is required.")
      .max(10_000_000, "Actual price is too large."),
    offer_price: optionalCount("Offer price", 0, 10_000_000),
    banner_image_url: z.string().trim().url("Invalid banner image.").nullable(),
    services: z.array(z.enum(PACKAGE_SERVICES)),
    edited_pictures_count: optionalCount("Edited pictures", 0, 100_000),
    edited_videos_count: optionalCount("Edited videos", 2, 1000),
    save_the_date_video_count: optionalCount("Save The Date videos", 0, 1000),
    countdown_images_count: optionalCount("Countdown images", 0, 1000),
    shoot_duration_unit: z.enum(["days", "hours"]).nullable(),
    shoot_duration_value: z
      .string()
      .trim()
      .max(30, "Shoot duration must be 30 characters or fewer.")
      .refine(noHtml, "HTML tags are not allowed.")
      .nullable(),
    travel_charges: z.enum(["extra", "included"]).nullable(),
    stay_charges: z.enum(["extra", "included"]).nullable(),
  })
  .refine((v) => v.offer_price == null || v.offer_price <= v.actual_price, {
    message: "Offer price cannot be higher than the actual price.",
    path: ["offer_price"],
  })
  .refine((v) => (v.shoot_duration_unit == null) === (v.shoot_duration_value == null), {
    message: "Choose Days or Hours and enter the duration (or leave both empty).",
    path: ["shoot_duration_value"],
  });

function number(formData: FormData, key: string) {
  const text = String(formData.get(key) ?? "").trim();
  return text === "" ? null : Number(text);
}

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value === "" ? null : value;
}

function parsePackageForm(formData: FormData) {
  return packageSchema.parse({
    package_type: String(formData.get("package_type") ?? ""),
    name: String(formData.get("name") ?? ""),
    actual_price: number(formData, "actual_price") ?? Number.NaN,
    offer_price: number(formData, "offer_price"),
    banner_image_url: text(formData, "banner_image_url"),
    services: formData.getAll("services").map(String),
    edited_pictures_count: number(formData, "edited_pictures_count"),
    edited_videos_count: number(formData, "edited_videos_count"),
    save_the_date_video_count: number(formData, "save_the_date_video_count"),
    countdown_images_count: number(formData, "countdown_images_count"),
    shoot_duration_unit: text(formData, "shoot_duration_unit"),
    shoot_duration_value: text(formData, "shoot_duration_value"),
    travel_charges: text(formData, "travel_charges"),
    stay_charges: text(formData, "stay_charges"),
  });
}

/** A banner must be an R2 image this photographer uploaded for packages
 * (photographer-packages/<their user id>/…), never a third-party URL or
 * another photographer's file. */
function isOwnPackageBanner(url: string, userId: string) {
  if (!isAllowedR2ImageUrl(url)) return false;
  return new URL(url).pathname.startsWith(`/photographer-packages/${userId}/`);
}

function validationMessage(err: unknown) {
  return err instanceof z.ZodError ? (err.issues[0]?.message ?? "Invalid form data.") : "Invalid form data.";
}

function dbMessage(error: { code?: string; message: string }) {
  if (error.message.includes("at most 3")) return error.message;
  return "Could not save the package. Please try again.";
}

function refresh() {
  revalidatePublicContent(CACHE_TAGS.photographers);
  revalidatePath("/photographer/packages");
}

export async function createPackage(_prev: PackageFormState, formData: FormData): Promise<PackageFormState> {
  const photographer = await getAuthorizedPhotographerUser();
  if (!photographer) redirect("/sign-in/photographer");

  let values: ReturnType<typeof parsePackageForm>;
  try {
    values = parsePackageForm(formData);
  } catch (err) {
    return { error: validationMessage(err) };
  }
  if (values.banner_image_url && !isOwnPackageBanner(values.banner_image_url, photographer.id)) {
    return { error: "Invalid banner image. Please upload it again." };
  }

  const supabase = await createClient();
  const { count } = await supabase
    .from("photographer_packages")
    .select("id", { count: "exact", head: true })
    .eq("photographer_id", photographer.id)
    .eq("package_type", values.package_type);
  if ((count ?? 0) >= MAX_PACKAGES_PER_TYPE) {
    return { error: `You can create at most ${MAX_PACKAGES_PER_TYPE} packages of this type.` };
  }

  const { error } = await supabase.from("photographer_packages").insert({ ...values, photographer_id: photographer.id });
  if (error) return { error: dbMessage(error) };

  refresh();
  redirect("/photographer/packages?saved=1");
}

export async function updatePackage(
  id: string,
  _prev: PackageFormState,
  formData: FormData,
): Promise<PackageFormState> {
  const photographer = await getAuthorizedPhotographerUser();
  if (!photographer) redirect("/sign-in/photographer");
  if (!z.string().uuid().safeParse(id).success) redirect("/photographer/packages");

  let values: ReturnType<typeof parsePackageForm>;
  try {
    values = parsePackageForm(formData);
  } catch (err) {
    return { error: validationMessage(err) };
  }
  if (values.banner_image_url && !isOwnPackageBanner(values.banner_image_url, photographer.id)) {
    return { error: "Invalid banner image. Please upload it again." };
  }

  // The package type is fixed once created — it is never taken from the form on update.
  const { package_type: _ignored, ...changes } = values;
  void _ignored;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("photographer_packages")
    .update(changes)
    .eq("id", id)
    .eq("photographer_id", photographer.id)
    .select("id");
  if (error) return { error: dbMessage(error) };
  if (!data || data.length === 0) return { error: "Package not found." };

  refresh();
  redirect("/photographer/packages?saved=1");
}

export async function setPackageVisibility(formData: FormData) {
  const photographer = await getAuthorizedPhotographerUser();
  if (!photographer) redirect("/sign-in/photographer");

  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) redirect("/photographer/packages");

  const supabase = await createClient();
  await supabase
    .from("photographer_packages")
    .update({ is_visible: formData.get("visible") === "true" })
    .eq("id", id)
    .eq("photographer_id", photographer.id);

  refresh();
  redirect("/photographer/packages");
}

export async function deletePackage(formData: FormData) {
  const photographer = await getAuthorizedPhotographerUser();
  if (!photographer) redirect("/sign-in/photographer");

  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) redirect("/photographer/packages");

  const supabase = await createClient();
  await supabase.from("photographer_packages").delete().eq("id", id).eq("photographer_id", photographer.id);

  refresh();
  redirect("/photographer/packages");
}
