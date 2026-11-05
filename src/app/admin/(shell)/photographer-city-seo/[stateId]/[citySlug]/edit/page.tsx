import { requireAdminPage } from "@/lib/supabase/require-permission";
import { getPublicPhotographers } from "@/lib/public-data";
import { PhotographerGeoEditor } from "@/components/admin/photographer-geo-editor";

export default async function EditPhotographerCitySeoPage({
  params,
  searchParams,
}: {
  params: Promise<{ stateId: string; citySlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdminPage();
  const { stateId, citySlug } = await params;
  const { error } = await searchParams;
  const cityName = (await getPublicPhotographers()).find((p) => p.citySlug === citySlug)?.city;
  return <PhotographerGeoEditor stateId={stateId} citySlug={citySlug} cityName={cityName} error={error} />;
}
