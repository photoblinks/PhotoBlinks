import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PhotographerForm } from "../../photographer-form";
import { updatePhotographer } from "../../actions";

export default async function EditPhotographerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const todayIso = new Date().toISOString().slice(0, 10);
  const [{ data: photographer }, { data: states }, { data: activePhotographers }] =
    await Promise.all([
      supabase.from("sponsored_photographers").select("*").eq("id", id).maybeSingle(),
      supabase.from("states").select("id, name").order("name"),
      supabase
        .from("sponsored_photographers")
        .select("state_id")
        .gte("expiry_date", todayIso)
        .neq("id", id),
    ]);

  if (!photographer) notFound();

  const occupiedStateIds = new Set((activePhotographers ?? []).map((p) => p.state_id));
  const availableStates = (states ?? []).filter((s) => !occupiedStateIds.has(s.id));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Edit sponsored photographer</h1>
        <Link href={`/admin/photographers/${id}/analytics`} className="text-sm text-pb-brand hover:underline">
          View Analytics
        </Link>
      </div>
      <PhotographerForm
        action={updatePhotographer.bind(null, id)}
        photographer={photographer}
        states={availableStates}
        error={error}
      />
    </div>
  );
}
