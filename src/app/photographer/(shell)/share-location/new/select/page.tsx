import type { Metadata } from "next";
import { ShareLocationCatalog, type CatalogSearchParams } from "../../share-location-catalog";

export const metadata: Metadata = {
  title: "Select Locations",
  robots: { index: false, follow: false },
};

export default function NewShareSelectPage({ searchParams }: { searchParams: CatalogSearchParams }) {
  return <ShareLocationCatalog searchParams={searchParams} basePath="/photographer/share-location/new/select" />;
}
