import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StudioForm } from "../../studio-form";
import { updateStudio } from "../../actions";

export default async function EditStudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: studio }, { data: countries }, { data: states }] = await Promise.all([
    supabase
      .from("studios")
      .select(
        "*, cities(name), studio_images(image_url, sort_order), studio_pricing_options(label, price, sort_order)",
      )
      .eq("id", id)
      .single(),
    supabase.from("countries").select("id, name").order("name"),
    supabase.from("states").select("id, name, country_id").order("name"),
  ]);

  if (!studio) notFound();

  const images = [...(studio.studio_images ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((img) => img.image_url);

  const pricingOptions = [...(studio.studio_pricing_options ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((o) => ({ label: o.label, price: o.price }));

  const cityRef = Array.isArray(studio.cities) ? studio.cities[0] : studio.cities;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Edit studio</h1>
      <StudioForm
        action={updateStudio.bind(null, id)}
        studio={{ ...studio, images, pricingOptions, city_name: cityRef?.name }}
        countries={countries ?? []}
        states={states ?? []}
        error={error}
      />
    </div>
  );
}
