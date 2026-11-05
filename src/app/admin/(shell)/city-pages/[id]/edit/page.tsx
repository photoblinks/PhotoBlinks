import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/supabase/require-permission";
import { GeoPageForm } from "@/components/admin/geo-page-form";
import { SeoInventoryBreakdown, type SeoBreakdownRow } from "@/components/admin/seo-inventory-breakdown";
import { parseEditorialBlocks } from "@/lib/blog/content-blocks";
import { parseCityQuickFacts } from "@/lib/city-quick-facts";
import type { BlogBlockInput } from "@/components/admin/blog-content-editor";
import { EditorialForm } from "../../../editorial/editorial-form";
import { updateCityPage } from "../../actions";

export default async function EditCityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdminPage();

  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const { data: city } = await supabase
    .from("cities")
    .select("*, states(slug, countries(slug))")
    .eq("id", id)
    .single();

  if (!city) notFound();

  const state = Array.isArray(city.states) ? city.states[0] : city.states;
  const stateSlug = (state as { slug: string; countries: unknown } | null)?.slug ?? "";
  const countryRaw = (state as { countries: unknown } | null)?.countries;
  const country = Array.isArray(countryRaw) ? countryRaw[0] : countryRaw;
  const countrySlug = (country as { slug: string } | null)?.slug ?? "";

  // Published-location breakdown by category within this city — one
  // grouped query plus one batched category lookup, scoped to this single
  // city, so it stays cheap regardless of total site size.
  const [{ data: cityLocations }, { data: editorialRows }] = await Promise.all([
    supabase
      .from("locations")
      .select("id, name, category_id")
      .eq("city_id", id)
      .eq("is_published", true)
      .order("name")
      .limit(500),
    supabase.from("location_editorial").select("id, status, content").eq("city_id", id).eq("scope", "city"),
  ]);

  const categoryCounts = new Map<string, number>();
  for (const location of cityLocations ?? []) {
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
      href: `/admin/seo/location-categories?city=${city.slug}&category=${category.slug}`,
    }))
    .sort((a, b) => b.count - a.count);

  const editorial = editorialRows?.[0];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Edit City Page — {city.name}</h1>
      <GeoPageForm
        action={updateCityPage.bind(null, id)}
        record={city}
        imageKind="cities"
        imageSlug={city.slug}
        pageUrl={`/locations/${countrySlug}/${stateSlug}/${city.slug}`}
        defaultH1={`Photoshoot Locations in ${city.name}`}
        error={error}
        quickFacts={parseCityQuickFacts(city.quick_facts)}
      />
      <SeoInventoryBreakdown
        title={`SEO inventory by category in ${city.name}`}
        rows={breakdownRows}
        emptyText="No published locations in this city yet."
      />
      <div className="mt-10 border-t pt-8">
        <p className="mb-4 text-sm text-muted-foreground">
          Blog shown below the cards on the city&apos;s Locations and Studios pages.
        </p>
        <EditorialForm
          target={{
            scope: "city",
            cityId: id,
            syntheticSlug: `city-${city.slug}`,
            title: `Blog — ${city.name}`,
          }}
          existing={
            editorial
              ? {
                  id: editorial.id,
                  status: editorial.status as "draft" | "published",
                  content: parseEditorialBlocks(editorial.content) as unknown as BlogBlockInput[],
                }
              : undefined
          }
          locations={(cityLocations ?? []).map(({ id: locationId, name }) => ({ id: locationId, name }))}
        />
      </div>
    </div>
  );
}
