import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedPhotographerUser, normalizeRelation } from "@/lib/supabase/require-photographer";
import { ShareSelectionProvider } from "../../share-location-client";

type LocationRow = {
  sort_order: number;
  locations:
    | { id: string; name: string; card_name: string | null; is_published: boolean }
    | { id: string; name: string; card_name: string | null; is_published: boolean }[]
    | null;
};

/** Loads the photographer's own share (RLS-scoped) once, into state that
 * survives every filter change in the picker below. */
export default async function EditShareLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const photographer = await getAuthorizedPhotographerUser();
  if (!photographer) redirect("/photographer");

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const { data: collection } = await supabase
    .from("photographer_location_collections")
    .select(
      "id, name, photographer_location_collection_locations(sort_order, locations(id, name, card_name, is_published))",
    )
    .eq("id", id)
    .eq("photographer_id", photographer.id)
    .maybeSingle();
  if (!collection) notFound();

  // Locations unpublished since they were added are dropped: they can't be
  // saved back (the save re-validates) and aren't shown publicly anyway.
  const initialSelection = ((collection.photographer_location_collection_locations ?? []) as LocationRow[])
    .map((row) => ({ sortOrder: row.sort_order, location: normalizeRelation(row.locations) }))
    .filter((row) => row.location?.is_published)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ location }) => ({ id: location!.id, name: location!.card_name || location!.name }));

  return (
    <ShareSelectionProvider
      collectionId={collection.id}
      initialName={collection.name}
      initialSelection={initialSelection}
    >
      {children}
    </ShareSelectionProvider>
  );
}
