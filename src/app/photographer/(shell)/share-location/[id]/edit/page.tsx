import type { Metadata } from "next";
import { ShareLocationCatalog, type CatalogSearchParams } from "../../share-location-catalog";

export const metadata: Metadata = {
  title: "Edit Location Share",
  robots: { index: false, follow: false },
};

export default async function EditSharePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: CatalogSearchParams;
}) {
  const { id } = await params;
  return (
    <ShareLocationCatalog searchParams={searchParams} basePath={`/photographer/share-location/${id}/edit`} />
  );
}
