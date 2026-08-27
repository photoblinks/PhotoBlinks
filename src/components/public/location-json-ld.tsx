import type { PublicLocationDetail } from "@/lib/public-data";
import { buildLocationJsonLd } from "@/lib/jsonld";
import { JsonLd } from "./json-ld";
import type { BreadcrumbItem } from "./breadcrumbs";

/** Combined Place/TouristAttraction + BreadcrumbList structured data for a
 * location detail page, rendered as one JSON-LD script with an @graph.
 * Takes the already-loaded location and the already-computed breadcrumb
 * trail — it never fetches anything itself. */
export function LocationJsonLd({
  location,
  breadcrumbItems,
}: {
  location: PublicLocationDetail;
  breadcrumbItems: BreadcrumbItem[];
}) {
  return <JsonLd data={buildLocationJsonLd(location, breadcrumbItems)} />;
}
