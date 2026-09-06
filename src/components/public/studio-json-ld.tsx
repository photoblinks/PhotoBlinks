import type { PublicStudioDetail } from "@/lib/public-data";
import { buildStudioJsonLd } from "@/lib/jsonld";
import { JsonLd } from "./json-ld";
import type { BreadcrumbItem } from "./breadcrumbs";

/** Combined LocalBusiness + BreadcrumbList structured data for a studio
 * detail page, rendered as one JSON-LD script with an @graph. Takes the
 * already-loaded studio and the already-computed breadcrumb trail — it
 * never fetches anything itself. Mirrors LocationJsonLd. */
export function StudioJsonLd({
  studio,
  breadcrumbItems,
}: {
  studio: PublicStudioDetail;
  breadcrumbItems: BreadcrumbItem[];
}) {
  return <JsonLd data={buildStudioJsonLd(studio, breadcrumbItems)} />;
}
