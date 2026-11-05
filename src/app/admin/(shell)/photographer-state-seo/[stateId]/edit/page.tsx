import { requireAdminPage } from "@/lib/supabase/require-permission";
import { PhotographerGeoEditor } from "@/components/admin/photographer-geo-editor";

export default async function EditPhotographerStateSeoPage({
  params,
  searchParams,
}: {
  params: Promise<{ stateId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdminPage();
  const { stateId } = await params;
  const { error } = await searchParams;
  return <PhotographerGeoEditor stateId={stateId} citySlug={null} error={error} />;
}
