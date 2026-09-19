import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireModulePage, PERMISSION } from "@/lib/supabase/require-permission";
import { StudioForm } from "../../studio-form";
import { updateStudio } from "../../actions";

export default async function EditStudioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModulePage([PERMISSION.STUDIOS_EDIT]);

  const { id } = await params;
  const supabase = await createClient();

  const [{ data: studio }, { data: countries }, { data: states }] = await Promise.all([
    supabase
      .from("studios")
      .select(
        "*, cities(name), studio_images(image_url, sort_order), studio_pricing_options(label, price, sort_order), studio_faqs(question, answer, sort_order)",
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
  const faqs = [...(studio.studio_faqs ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((f) => ({ question: f.question, answer: f.answer }));

  const cityRef = Array.isArray(studio.cities) ? studio.cities[0] : studio.cities;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Edit studio</h1>
      <StudioForm
        action={updateStudio.bind(null, id)}
        studio={{ ...studio, images, pricingOptions, faqs, city_name: cityRef?.name }}
        countries={countries ?? []}
        states={states ?? []}
      />
    </div>
  );
}
