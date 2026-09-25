import { getLocationEditorial, getPublicLocationInfoByIds, getLocationInfoTableConfig } from "@/lib/public-data";
import { BlogContentRenderer } from "@/components/public/blog-content-renderer";
import type { BlogBlock } from "@/lib/blog/content-blocks";

/** Collects every canonical location id referenced by the content's
 * locationLink and locationInfoTable blocks, so they can be resolved in a
 * single batched query rather than one query per block. */
function collectLocationIds(blocks: BlogBlock[]): string[] {
  const ids = new Set<string>();
  for (const block of blocks) {
    if (block.type === "locationLink") ids.add(block.locationId);
    if (block.type === "locationInfoTable") for (const id of block.locationIds) ids.add(id);
  }
  return [...ids];
}

/**
 * Server-rendered editorial section for a State page (categoryId null) or a
 * State + Category page. Renders nothing when there is no published
 * editorial content, and never leaves an empty container. All content and
 * location data exist in the initial HTML — no client fetch.
 */
export async function EditorialSection({
  stateId,
  categoryId,
}: {
  stateId: string;
  categoryId: string | null;
}) {
  const blocks = await getLocationEditorial(stateId, categoryId);
  if (blocks.length === 0) return null;

  const locationIds = collectLocationIds(blocks);
  const [locationEntries, config] = await Promise.all([
    locationIds.length > 0 ? getPublicLocationInfoByIds(locationIds) : Promise.resolve([]),
    getLocationInfoTableConfig(),
  ]);

  const locationInfo = new Map(locationEntries.map((entry) => [entry.id, entry]));
  const locationLinks = locationEntries.map(({ id, name, slug }) => ({ id, name, slug }));

  return (
    <section className="mt-12 border-t border-border pt-8">
      <BlogContentRenderer
        blocks={blocks}
        locationLinks={locationLinks}
        locationInfo={locationInfo}
        infoTableConfig={config}
      />
    </section>
  );
}
