import { createClient } from "@/lib/supabase/server";
import { StudioForm } from "../studio-form";
import { createStudio } from "../actions";

export default async function NewStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: states }, { data: cities }] = await Promise.all([
    supabase.from("states").select("id, name").order("name"),
    supabase.from("cities").select("id, name, state_id").order("name"),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Add studio</h1>
      <StudioForm
        action={createStudio}
        states={states ?? []}
        cities={cities ?? []}
        error={error}
      />
    </div>
  );
}
