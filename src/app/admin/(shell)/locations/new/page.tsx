import { createClient } from "@/lib/supabase/server";
import { LocationForm } from "../location-form";
import { createLocation } from "../actions";

export default async function NewLocationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: categories }, { data: states }, { data: cities }] = await Promise.all([
    supabase.from("categories").select("id, name").order("sort_order"),
    supabase.from("states").select("id, name").order("name"),
    supabase.from("cities").select("id, name, state_id").order("name"),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Add location</h1>
      <LocationForm
        action={createLocation}
        categories={categories ?? []}
        states={states ?? []}
        cities={cities ?? []}
        error={error}
      />
    </div>
  );
}
