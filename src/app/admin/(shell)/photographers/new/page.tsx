import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/supabase/require-permission";
import { PhotographerForm } from "../photographer-form";
import { createPhotographer } from "../actions";

export default async function NewPhotographerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdminPage();

  const { error } = await searchParams;
  const supabase = await createClient();

  const todayIso = new Date().toISOString().slice(0, 10);
  const [{ data: states }, { data: activePhotographers }] = await Promise.all([
    supabase.from("states").select("id, name").order("name"),
    supabase.from("sponsored_photographers").select("state_id").gte("expiry_date", todayIso),
  ]);

  const occupiedStateIds = new Set((activePhotographers ?? []).map((p) => p.state_id));
  const availableStates = (states ?? []).filter((s) => !occupiedStateIds.has(s.id));

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Add sponsored photographer</h1>
      <PhotographerForm action={createPhotographer} states={availableStates} error={error} />
    </div>
  );
}
