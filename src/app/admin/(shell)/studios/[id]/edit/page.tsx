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

  const [{ data: studio }, { data: states }, { data: cities }] = await Promise.all([
    supabase
      .from("studios")
      .select("*, studio_images(image_url, sort_order), studio_pricing_options(label, price, sort_order)")
      .eq("id", id)
      .single(),
    supabase.from("states").select("id, name").order("name"),
    supabase.from("cities").select("id, name, state_id").order("name"),
  ]);

  if (!studio) notFound();

  const images = [...(studio.studio_images ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((img) => img.image_url);

  const pricingOptions = [...(studio.studio_pricing_options ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((o) => ({ label: o.label, price: o.price }));

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Edit studio</h1>
      <StudioForm
        action={updateStudio.bind(null, id)}
        studio={{ ...studio, images, pricingOptions }}
        states={states ?? []}
        cities={cities ?? []}
        error={error}
      />
    </div>
  );
}
