import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GeoPageForm } from "@/components/admin/geo-page-form";
import { updateCountryPage } from "../../actions";

export default async function EditCountryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const { data: country } = await supabase
    .from("countries")
    .select("*")
    .eq("id", id)
    .single();

  if (!country) notFound();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Edit Country Page — {country.name}</h1>
      <GeoPageForm
        action={updateCountryPage.bind(null, id)}
        record={country}
        imageKind="countries"
        imageSlug={country.slug}
        pageUrl={`/locations/${country.slug}`}
        defaultH1={`Photoshoot Locations in ${country.name}`}
        error={error}
      />
    </div>
  );
}
