import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GeoPageForm } from "@/components/admin/geo-page-form";
import { updateStatePage } from "../../actions";

export default async function EditStatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const { data: state } = await supabase
    .from("states")
    .select("*, countries(slug)")
    .eq("id", id)
    .single();

  if (!state) notFound();

  const country = Array.isArray(state.countries) ? state.countries[0] : state.countries;
  const countrySlug = (country as { slug: string } | null)?.slug ?? "";

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Edit State Page — {state.name}</h1>
      <GeoPageForm
        action={updateStatePage.bind(null, id)}
        record={state}
        imageKind="states"
        imageSlug={state.slug}
        pageUrl={`/locations/${countrySlug}/${state.slug}`}
        defaultH1={`Photoshoot Locations in ${state.name}`}
        error={error}
      />
    </div>
  );
}
