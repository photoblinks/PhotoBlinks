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

  const [{ data: location }, { data: categories }, { data: states }, { data: cities }] =
    await Promise.all([
      supabase
        .from("locations")
        .select("*, location_images(image_url, sort_order)")
        .eq("id", id)
        .single(),
      supabase.from("categories").select("id, name").order("sort_order"),
      supabase.from("states").select("id, name").order("name"),
      supabase.from("cities").select("id, name, state_id").order("name"),
    ]);

  if (!location) notFound();

  const images = [...(location.location_images ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((img) => img.image_url);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Edit location</h1>
      <LocationForm
        action={updateLocation.bind(null, id)}
        location={{ ...location, images }}
        categories={categories ?? []}
        states={states ?? []}
        cities={cities ?? []}
        error={error}
      />
    </div>
  );
}
