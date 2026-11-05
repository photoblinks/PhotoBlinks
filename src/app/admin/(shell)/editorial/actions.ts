"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedAdminUser } from "@/lib/supabase/require-admin";
import { parseEditorialContent } from "@/lib/blog/content-blocks";
import { LOCATION_INFO_FIELDS, type LocationInfoTableConfig } from "@/lib/location-info-fields";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type EditorialScope = "state" | "state_category" | "city" | "city_category" | "photographer_state" | "photographer_city";

const editorTargetSchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("state"), state_id: z.string().uuid() }),
  z.object({
    scope: z.literal("state_category"),
    state_id: z.string().uuid(),
    category_id: z.string().uuid(),
  }),
  z.object({ scope: z.literal("city"), city_id: z.string().uuid() }),
  z.object({ scope: z.literal("city_category"), city_id: z.string().uuid(), category_id: z.string().uuid() }),
  z.object({ scope: z.literal("photographer_state"), state_id: z.string().uuid() }),
  z.object({
    scope: z.literal("photographer_city"),
    state_id: z.string().uuid(),
    city_slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  }),
]);

type EditorTarget = z.infer<typeof editorTargetSchema>;

/** Admin page the editor lives on — city scopes are edited inside the City
 * Pages admin, so saves return there. Derived server-side, never from input. */
function adminBackPath(target: {
  scope: EditorialScope;
  state_id?: string | null;
  category_id?: string | null;
  city_id?: string | null;
  city_slug?: string | null;
}) {
  if (target.scope === "photographer_state") return `/admin/photographer-state-seo/${target.state_id}/edit`;
  if (target.scope === "photographer_city") {
    return `/admin/photographer-city-seo/${target.state_id}/${target.city_slug}/edit`;
  }
  if (target.scope === "city") {
    return `/admin/city-pages/${target.city_id}/edit`;
  }
  if (target.scope === "city_category") {
    return `/admin/seo/location-categories/${target.city_id}/${target.category_id}/edit`;
  }
  return target.scope === "state_category"
    ? `/admin/seo/location-state-categories/${target.state_id}/${target.category_id}/edit`
    : `/admin/editorial/state/${target.state_id}/edit`;
}

const statusSchema = z.enum(["draft", "published"]);

function readFormString(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key);
  return typeof value === "string" ? value : fallback;
}

function validationMessage(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? fallback;
  return error instanceof Error ? error.message : fallback;
}

/** Resolves the live public URL for an editorial page so it can be
 * revalidated after a save/publish — mirrors the resolvePublicPath helpers
 * in the SEO actions. */
async function resolvePublicPath(
  supabase: SupabaseServerClient,
  scope: EditorialScope,
  stateId: string,
  categoryId?: string,
  citySlug?: string,
): Promise<string | null> {
  const [{ data: state }, { data: category }] = await Promise.all([
    supabase.from("states").select("slug, countries(slug)").eq("id", stateId).maybeSingle(),
    categoryId
      ? supabase.from("categories").select("slug").eq("id", categoryId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!state) return null;
  const countrySlug = Array.isArray(state.countries) ? (state.countries[0]?.slug ?? null) : null;
  if (!countrySlug) return null;

  if (scope === "city_category") {
    return citySlug && category?.slug ? `/locations/${countrySlug}/${state.slug}/${citySlug}/${category.slug}` : null;
  }
  if (scope === "photographer_state") return `/photographers/${countrySlug}/${state.slug}`;
  if (scope === "photographer_city") {
    return citySlug ? `/photographers/${countrySlug}/${state.slug}/${citySlug}` : null;
  }
  if (scope === "city") {
    if (!citySlug) return null;
    return `/locations/${countrySlug}/${state.slug}/${citySlug}`;
  }
  if (scope === "state_category") {
    if (!category?.slug) return null;
    return `/locations/${countrySlug}/${state.slug}/${category.slug}`;
  }
  return `/locations/${countrySlug}/${state.slug}`;
}

/** Saves (creates or updates) a State, State + Category or City editorial
 * row. Save never changes status — publish is a separate toggle. Content is
 * validated on write with parseEditorialContent (same strict Zod/content
 * philosophy as the blog CMS). City scopes derive state_id from the city
 * row server-side and return to the City Pages editor. */
export async function saveEditorial(formData: FormData) {
  const admin = await getAuthorizedAdminUser();
  if (!admin) redirect("/admin/login");

  let target: EditorTarget;
  try {
    target = editorTargetSchema.parse({
      scope: formData.get("scope"),
      state_id: readFormString(formData, "state_id"),
      category_id: readFormString(formData, "category_id").trim(),
      city_id: readFormString(formData, "city_id"),
      city_slug: readFormString(formData, "city_slug"),
    });
  } catch {
    redirect(`/admin/editorial?error=${encodeURIComponent("Invalid editorial target.")}`);
  }

  const supabase = await createClient();
  const cityId = "city_id" in target ? target.city_id : undefined;
  const isPhotographerScope = target.scope === "photographer_state" || target.scope === "photographer_city";
  const photographerCitySlug = target.scope === "photographer_city" ? target.city_slug : undefined;
  const isCityScope = Boolean(cityId) || isPhotographerScope || target.scope === "state_category";
  const categoryId =
    target.scope === "state_category" || target.scope === "city_category" ? target.category_id : undefined;

  let stateId = "state_id" in target ? target.state_id : "";
  let citySlug: string | undefined = photographerCitySlug;
  if (cityId) {
    const { data: city } = await supabase.from("cities").select("slug, state_id").eq("id", cityId).maybeSingle();
    if (!city) redirect(`/admin/city-pages?error=${encodeURIComponent("City not found.")}`);
    stateId = city.state_id;
    citySlug = city.slug;
  }

  const back = adminBackPath({
    scope: target.scope,
    state_id: stateId,
    category_id: categoryId,
    city_id: cityId,
    city_slug: photographerCitySlug,
  });
  const doneRedirect = isCityScope ? back : "/admin/editorial";

  let content;
  try {
    content = parseEditorialContent(readFormString(formData, "content_json", "[]"));
  } catch (err) {
    redirect(`${back}?error=${encodeURIComponent(validationMessage(err, "Invalid content."))}`);
  }

  // Select-then-insert/update: the partial unique indexes can't be used as a
  // supabase upsert onConflict target (the conflict columns differ per scope).
  let match = supabase.from("location_editorial").select("id").eq("scope", target.scope);
  match = cityId ? match.eq("city_id", cityId) : match.eq("state_id", stateId);
  if (photographerCitySlug) match = match.eq("city_slug", photographerCitySlug);
  match = categoryId ? match.eq("category_id", categoryId) : match.is("category_id", null);

  const { data: existing, error: loadError } = await match.maybeSingle();
  if (loadError) {
    redirect(`${doneRedirect}?error=${encodeURIComponent("Could not load existing editorial content.")}`);
  }

  if (existing) {
    const { error } = await supabase.from("location_editorial").update({ content }).eq("id", existing.id);
    if (error) redirect(`${doneRedirect}?error=${encodeURIComponent(error.message)}`);
  } else {
    const { error } = await supabase.from("location_editorial").insert({
      scope: target.scope,
      state_id: stateId,
      category_id: categoryId ?? null,
      city_id: cityId ?? null,
      city_slug: photographerCitySlug ?? null,
      content,
      status: "draft",
    });
    if (error) redirect(`${doneRedirect}?error=${encodeURIComponent(error.message)}`);
  }

  updateTag("location-editorial");
  revalidatePath("/admin/editorial");
  const path = await resolvePublicPath(supabase, target.scope, stateId, categoryId, citySlug);
  if (path) revalidatePath(path);
  redirect(doneRedirect);
}

/** Publishes or unpublishes an editorial row. published_at is set once by
 * the database trigger (mirrors blog_posts), never here. */
export async function toggleEditorialStatus(formData: FormData) {
  const admin = await getAuthorizedAdminUser();
  if (!admin) redirect("/admin/login");

  const id = readFormString(formData, "id");
  const status = statusSchema.safeParse(formData.get("status"));
  if (!status.success || !z.string().uuid().safeParse(id).success) {
    redirect(`/admin/editorial?error=${encodeURIComponent("Invalid editorial status request.")}`);
  }

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("location_editorial")
    .select("scope, state_id, category_id, city_id, city_slug")
    .eq("id", id)
    .maybeSingle();
  if (!row) redirect(`/admin/editorial?error=${encodeURIComponent("Editorial not found.")}`);

  const scope = row.scope as EditorialScope;
  const isCityScope = scope !== "state";
  const doneRedirect = isCityScope ? adminBackPath({ ...row, scope }) : "/admin/editorial";

  const { error } = await supabase.from("location_editorial").update({ status: status.data }).eq("id", id);
  if (error) redirect(`${doneRedirect}?error=${encodeURIComponent(error.message)}`);

  let citySlug: string | undefined = row.city_slug ?? undefined;
  if (row.city_id) {
    const { data: city } = await supabase.from("cities").select("slug").eq("id", row.city_id).maybeSingle();
    citySlug = city?.slug;
  }

  updateTag("location-editorial");
  revalidatePath("/admin/editorial");
  const path = await resolvePublicPath(supabase, scope, row.state_id, row.category_id ?? undefined, citySlug);
  if (path) revalidatePath(path);
  redirect(doneRedirect);
}

/** Persists the centralized location-information-table configuration on the
 * single-row site_settings table. Field codes are filtered against the
 * canonical registry so unknown codes can never be stored. */
export async function saveLocationInfoTableConfig(formData: FormData) {
  const admin = await getAuthorizedAdminUser();
  if (!admin) redirect("/admin/login");

  const enabled = formData
    .getAll("enabled")
    .map(String)
    .filter((code) => LOCATION_INFO_FIELDS.some((field) => field.code === code));

  const labels: Record<string, string> = {};
  for (const field of LOCATION_INFO_FIELDS) {
    const value = readFormString(formData, `label_${field.code}`).trim();
    if (value) labels[field.code] = value.slice(0, 200);
  }

  let order: string[] = [];
  try {
    const parsed: unknown = JSON.parse(readFormString(formData, "order"));
    if (Array.isArray(parsed)) {
      order = parsed.filter(
        (code): code is string => typeof code === "string" && LOCATION_INFO_FIELDS.some((field) => field.code === code),
      );
    }
  } catch {
    order = [];
  }

  const config: LocationInfoTableConfig = { enabled, order, labels };

  const supabase = await createClient();
  const { error } = await supabase
    .from("site_settings")
    .update({ location_info_table_config: config })
    .eq("id", true);
  if (error) redirect(`/admin/editorial?error=${encodeURIComponent(error.message)}`);

  updateTag("location-info-table-config");
  revalidatePath("/admin/editorial");
  redirect("/admin/editorial");
}
