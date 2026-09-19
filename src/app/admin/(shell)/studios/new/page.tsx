import { createClient } from "@/lib/supabase/server";
import { requireModulePage, PERMISSION } from "@/lib/supabase/require-permission";
import { StudioForm } from "../studio-form";
import { createStudio } from "../actions";

export default async function NewStudioPage() {
  await requireModulePage([PERMISSION.STUDIOS_EDIT]);

  const supabase = await createClient();

  const [{ data: countries }, { data: states }] = await Promise.all([
    supabase.from("countries").select("id, name").order("name"),
    supabase.from("states").select("id, name, country_id").order("name"),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Add studio</h1>
      <StudioForm
        action={createStudio}
        countries={countries ?? []}
        states={states ?? []}
      />
    </div>
  );
}
