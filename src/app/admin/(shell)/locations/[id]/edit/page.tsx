import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LocationForm } from "../../location-form";
import { updateLocation } from "../../actions";

export default async function EditLocationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: location }, { data: categories }, { data: countries }, { data: states }] =
    await Promise.all([
      supabase
        .from("locations")
        .select(
          "*, cities(name), location_images(image_url, sort_order), location_faqs(question, answer, sort_order)",
        )
        .eq("id", id)
        .single(),
      supabase.from("categories").select("id, name").order("sort_order"),
      supabase.from("countries").select("id, name").order("name"),
      supabase.from("states").select("id, name, country_id").order("name"),
    ]);

  if (!location) notFound();

  const images = [...(location.location_images ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((img) => img.image_url);
  const faqs = [...(location.location_faqs ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((f) => ({ question: f.question, answer: f.answer }));
  const cityRef = Array.isArray(location.cities) ? location.cities[0] : location.cities;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Edit location</h1>
      <LocationForm
        action={updateLocation.bind(null, id)}
        location={{ ...location, images, faqs, city_name: cityRef?.name }}
        categories={categories ?? []}
        countries={countries ?? []}
        states={states ?? []}
        error={error}
      />
    </div>
  );
}
