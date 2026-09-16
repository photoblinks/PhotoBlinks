import { redirect } from "next/navigation";
import { getAuthorizedPhotographerUser } from "@/lib/supabase/require-photographer";
import { ShareSelectionProvider } from "../share-location-client";

/** Shared by the name step and the picker so the name and selection survive
 * moving between them and every filter change in the picker. */
export default async function NewShareLayout({ children }: { children: React.ReactNode }) {
  const photographer = await getAuthorizedPhotographerUser();
  if (!photographer) redirect("/photographer");

  return (
    <ShareSelectionProvider collectionId={null} initialName="" initialSelection={[]}>
      {children}
    </ShareSelectionProvider>
  );
}
