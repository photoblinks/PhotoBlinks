import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GeoPageForm } from "@/components/admin/geo-page-form";
import { SeoInventoryBreakdown, type SeoBreakdownRow } from "@/components/admin/seo-inventory-breakdown";
import { updateStatePage } from "../../actions";

export default async function EditStatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const { data: state } = await supabase
    .from("states")
    .select("*, countries(slug)")
    .eq("id", id)
    .single();

  if (!state) notFound();

  const country = Array.isArray(state.countries) ? state.countries[0] : state.countries;
  const countrySlug = (country as { slug: string } | null)?.slug ?? "";

  // Published-location breakdown by category within this state — one
  // grouped query plus one batched category lookup, scoped to this single
  // state, so it stays cheap regardless of total site size.
  const { data: stateLocations } = await supabase
    .from("locations")
    .select("category_id")
    .eq("state_id", id)
    .eq("is_published", true);

  const categoryCounts = new Map<string, number>();
  for (const location of stateLocations ?? []) {
    if (!location.category_id) continue;
    categoryCounts.set(location.category_id, (categoryCounts.get(location.category_id) ?? 0) + 1);
  }
  const categoryIds = [...categoryCounts.keys()];
  const { data: categories } = categoryIds.length
    ? await supabase.from("categories").select("id, name, slug").in("id", categoryIds).order("name")
    : { data: [] as { id: string; name: string; slug: string }[] };

  const breakdownRows: SeoBreakdownRow[] = (categories ?? [])
    .map((category) => ({
      key: category.id,
      label: category.name,
      count: categoryCounts.get(category.id) ?? 0,
      href: `/admin/seo/location-categories?state=${state.slug}&category=${category.slug}`,
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Edit State Page — {state.name}</h1>
      <GeoPageForm
        action={updateStatePage.bind(null, id)}
        record={state}
        imageKind="states"
        imageSlug={state.slug}
        pageUrl={`/locations/${countrySlug}/${state.slug}`}
        defaultH1={`Photoshoot Locations in ${state.name}`}
        error={error}
      />
      <SeoInventoryBreakdown
        title={`SEO inventory by category in ${state.name}`}
        rows={breakdownRows}
        emptyText="No published locations in this state yet."
      />
    </div>
  );
}
