import {
  getCityEditorial,
  getEditorForContent,
  getCityQuickFacts,
  getLocationEditorial,
  getPublicLocationInfoByIds,
  getLocationInfoTableConfig,
} from "@/lib/public-data";
import { CityQuickFactsCard, buildQuickFactRows } from "@/components/public/city-quick-facts-card";
import { EditorCard } from "@/components/public/editor-card";
import { JsonLd } from "@/components/public/json-ld";
import { BlogContentRenderer } from "@/components/public/blog-content-renderer";
import type { BlogBlock, EditorialBlock } from "@/lib/blog/content-blocks";

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
export async function EditorialSection(
  props:
    | { stateId: string; categoryId: string | null }
    | { cityId: string; locationTypes?: string[] }
    | { blocks: EditorialBlock[] },
) {
  const [blocks, facts] =
    "blocks" in props
      ? [props.blocks, {}]
      : "cityId" in props
      ? await Promise.all([getCityEditorial(props.cityId), getCityQuickFacts(props.cityId)])
      : [await getLocationEditorial(props.stateId, props.categoryId), {}];
  const factRows = buildQuickFactRows(facts, "cityId" in props ? (props.locationTypes ?? []) : []);
  if (blocks.length === 0 && factRows.length === 0) return null;

  const locationIds = collectLocationIds(blocks);
  const [locationEntries, config, editor] = await Promise.all([
    locationIds.length > 0 ? getPublicLocationInfoByIds(locationIds) : Promise.resolve([]),
    getLocationInfoTableConfig(),
    blocks.length > 0 ? getEditorForContent(null) : Promise.resolve(null),
  ]);

  const locationInfo = new Map(locationEntries.map((entry) => [entry.id, entry]));
  const locationLinks = locationEntries.map(({ id, name, slug }) => ({ id, name, slug }));

  const blog = (
    <>
      <BlogContentRenderer
        blocks={blocks}
        locationLinks={locationLinks}
        locationInfo={locationInfo}
        infoTableConfig={config}
      />
      {editor && <EditorCard editor={editor} />}
    </>
  );

  // FAQ blocks in the blog also become FAQPage structured data.
  const faqs = blocks.filter((block): block is Extract<BlogBlock, { type: "faq" }> => block.type === "faq");
  const faqJsonLd =
    faqs.length > 0 ? (
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((faq) => ({
            "@type": "Question",
            name: faq.question,
            acceptedAnswer: { "@type": "Answer", text: faq.answer },
          })),
        }}
      />
    ) : null;

  // Quick Facts sits in a right column that sticks while the blog scrolls and
  // stops where the blog ends (the sticky card lives inside the grid row).
  return (
    <section className="mt-12 border-t border-border pt-8">
      {faqJsonLd}
      {factRows.length === 0 ? (
        blog
      ) : blocks.length === 0 ? (
        <div className="mx-auto max-w-md">
          <CityQuickFactsCard rows={factRows} />
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div>{blog}</div>
          <aside className="order-first self-start lg:sticky lg:top-24 lg:order-none">
            <CityQuickFactsCard rows={factRows} />
          </aside>
        </div>
      )}
    </section>
  );
}
