import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GeoPageForm } from "@/components/admin/geo-page-form";
import { parseEditorialBlocks } from "@/lib/blog/content-blocks";
import type { BlogBlockInput } from "@/components/admin/blog-content-editor";
import { EditorialForm } from "@/app/admin/(shell)/editorial/editorial-form";
import { savePhotographerGeoSeo } from "@/app/admin/(shell)/photographer-state-seo/actions";

/** Edit screen shared by Photography State SEO (citySlug null) and Photography
 * City SEO: banner / H1 / title tag / meta description plus the blog block
 * shown on the public photographer page. */
export async function PhotographerGeoEditor({
  stateId,
  citySlug,
  cityName,
  error,
}: {
  stateId: string;
  citySlug: string | null;
  cityName?: string;
  error?: string;
}) {
  const supabase = await createClient();
  const { data: state } = await supabase.from("states").select("id, name, slug, countries(slug)").eq("id", stateId).maybeSingle();
  if (!state) notFound();

  const country = Array.isArray(state.countries) ? state.countries[0] : state.countries;
  const pageName = cityName ?? state.name;
  const pageUrl = `/photographers/${country?.slug}/${state.slug}${citySlug ? `/${citySlug}` : ""}`;

  let seoQuery = supabase
    .from("photographer_geo_seo")
    .select("image_url, h1_title, meta_title, meta_description")
    .eq("state_id", stateId);
  let blogQuery = supabase
    .from("location_editorial")
    .select("id, status, content")
    .eq("state_id", stateId)
    .eq("scope", citySlug ? "photographer_city" : "photographer_state");
  if (citySlug) {
    seoQuery = seoQuery.eq("city_slug", citySlug);
    blogQuery = blogQuery.eq("city_slug", citySlug);
  } else {
    seoQuery = seoQuery.is("city_slug", null);
  }

  const [{ data: seo }, { data: blog }, { data: locations }] = await Promise.all([
    seoQuery.maybeSingle(),
    blogQuery.maybeSingle(),
    supabase.from("locations").select("id, name").eq("state_id", stateId).eq("is_published", true).order("name").limit(500),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Photography {citySlug ? "City" : "State"} SEO — {pageName}</h1>
      <GeoPageForm
        action={savePhotographerGeoSeo.bind(null, stateId, citySlug)}
        record={seo ?? undefined}
        imageKind={citySlug ? "cities" : "states"}
        imageSlug={citySlug ?? state.slug}
        pageUrl={pageUrl}
        defaultH1={`Pre-Wedding Photographers in ${pageName}`}
        error={error}
      />
      <div className="mt-10 border-t pt-8">
        <p className="mb-4 text-sm text-muted-foreground">
          Blog shown at the bottom of this photographer page. Drafts stay hidden until you publish.
        </p>
        <EditorialForm
          target={{
            scope: citySlug ? "photographer_city" : "photographer_state",
            stateId,
            citySlug: citySlug ?? undefined,
            syntheticSlug: `photographers-${citySlug ?? state.slug}`,
            title: `Blog — Photographers in ${pageName}`,
          }}
          existing={
            blog
              ? {
                  id: blog.id,
                  status: blog.status as "draft" | "published",
                  content: parseEditorialBlocks(blog.content) as unknown as BlogBlockInput[],
                }
              : undefined
          }
          locations={locations ?? []}
        />
      </div>
    </div>
  );
}
