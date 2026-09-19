import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/supabase/require-permission";
import { CategoryForm } from "../../category-form";
import { SeoInventoryBreakdown, type SeoBreakdownRow } from "@/components/admin/seo-inventory-breakdown";
import { updateCategory } from "../../actions";

export default async function EditCategoryPage({
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
  const { data: category } = await supabase
    .from("categories")
    .select("*")
    .eq("id", id)
    .single();

  if (!category) notFound();

  // Published-location breakdown by city for this category — one grouped
  // query plus one batched city lookup, scoped to this single category, so
  // it stays cheap regardless of total site size.
  const { data: categoryLocations } = await supabase
    .from("locations")
    .select("city_id")
    .eq("category_id", id)
    .eq("is_published", true);

  const cityCounts = new Map<string, number>();
  for (const location of categoryLocations ?? []) {
    if (!location.city_id) continue;
    cityCounts.set(location.city_id, (cityCounts.get(location.city_id) ?? 0) + 1);
  }
  const cityIds = [...cityCounts.keys()];
  const { data: cities } = cityIds.length
    ? await supabase.from("cities").select("id, name, slug").in("id", cityIds).order("name")
    : { data: [] as { id: string; name: string; slug: string }[] };

  const breakdownRows: SeoBreakdownRow[] = (cities ?? [])
    .map((city) => ({
      key: city.id,
      label: city.name,
      count: cityCounts.get(city.id) ?? 0,
      href: `/admin/seo/location-categories?city=${city.slug}&category=${category.slug}`,
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Edit category</h1>
      <CategoryForm
        action={updateCategory.bind(null, id)}
        category={category}
        error={error}
      />
      <SeoInventoryBreakdown
        title={`SEO inventory by city for ${category.name}`}
        rows={breakdownRows}
        emptyText="No published locations in this category yet."
      />
    </div>
  );
}
