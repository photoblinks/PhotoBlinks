import { getCityCentroids, type PublicPhotographer } from "@/lib/public-data";
import { PhotographerDirectoryClient } from "@/components/public/photographer-directory-client";

/** Server wrapper: attaches an approximate position (city centre, from the
 * city's published locations) to each photographer so "My Location" can
 * rank them by distance. Photographers have no coordinates of their own. */
export async function PhotographerDirectory({ photographers }: { photographers: PublicPhotographer[] }) {
  const centroids = await getCityCentroids();
  const cityCoords: Record<string, { lat: number; lng: number }> = {};
  for (const p of photographers) {
    const key = `${p.state.slug}/${p.citySlug}`;
    if (centroids[key]) cityCoords[key] = centroids[key];
  }
  return <PhotographerDirectoryClient photographers={photographers} cityCoords={cityCoords} />;
}
