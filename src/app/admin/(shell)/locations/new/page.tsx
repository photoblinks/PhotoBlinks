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

  const [{ data: categories }, { data: countries }, { data: states }] = await Promise.all([
    supabase.from("categories").select("id, name").order("sort_order"),
    supabase.from("countries").select("id, name").order("name"),
    supabase.from("states").select("id, name, country_id").order("name"),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Add location</h1>
      <LocationForm
        action={createLocation}
        categories={categories ?? []}
        countries={countries ?? []}
        states={states ?? []}
        error={error}
      />
    </div>
  );
}
