import { createClient } from "@/lib/supabase/server";
import { GalleryUploader } from "@/components/admin/gallery-uploader";
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldError } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { updateBannerImages } from "./actions";

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { error, saved } = await searchParams;
  const supabase = await createClient();
  const { data: bannerImages, error: bannerError } = await supabase
    .from("site_banner_images")
    .select("image_url")
    .order("sort_order");

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Settings</h1>

      {bannerError ? (
        <p className="max-w-lg text-sm text-destructive">
          Couldn&apos;t load the current banner images ({bannerError.message}). Reload the page and
          try again — saving from here would replace the existing banner with an empty one.
        </p>
      ) : (
        <form action={updateBannerImages} className="max-w-lg">
          <FieldGroup>
            {error && <FieldError>{error}</FieldError>}
            {saved && !error && (
              <p className="text-sm text-emerald-600">Homepage banner updated.</p>
            )}

            <Field>
              <FieldLabel>Homepage Banner Images</FieldLabel>
              <FieldDescription>
                Shown as a slideshow in the homepage hero section — rotates automatically through
                every image you add here, in order. Upload wide, high-resolution photos for best
                results.
              </FieldDescription>
              <GalleryUploader
                kind="site"
                slug="homepage-banner"
                name="images"
                defaultValue={(bannerImages ?? []).map((row) => row.image_url)}
              />
            </Field>

            <Button type="submit">Save</Button>
          </FieldGroup>
        </form>
      )}
    </div>
  );
}
