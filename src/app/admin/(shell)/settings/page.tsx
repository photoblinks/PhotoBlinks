import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/supabase/require-permission";
import { GalleryUploader } from "@/components/admin/gallery-uploader";
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldError } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateBannerImages, updateSocialMediaLinks } from "./actions";

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  await requireAdminPage();

  const { error, saved } = await searchParams;
  const supabase = await createClient();
  const { data: bannerImages, error: bannerError } = await supabase
    .from("site_banner_images")
    .select("image_url")
    .order("sort_order");

  // Current social media links (Admin → Settings → Social Media). Only the
  // five footer platform columns are read from site_settings.
  const { data: socialSettings, error: socialError } = await supabase
    .from("site_settings")
    .select("instagram_url, facebook_url, youtube_url, pinterest_url, linkedin_url")
    .eq("id", true)
    .maybeSingle();

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
            {saved && saved !== "social" && !error && (
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

      <section className="mt-10">
        <h2 className="mb-2 text-xl font-semibold">Social Media</h2>
        <p className="mb-6 max-w-lg text-sm text-muted-foreground">
          These profile links are displayed publicly as icons in the site footer. Leave an input
          empty to hide that platform from the footer.
        </p>

        {socialError ? (
          <p className="max-w-lg text-sm text-destructive">
            Couldn&apos;t load the current social media links ({socialError.message}). Reload the
            page and try again — saving from here would overwrite them.
          </p>
        ) : (
          <form action={updateSocialMediaLinks} className="max-w-lg">
            <FieldGroup>
              {error && <FieldError>{error}</FieldError>}
              {saved === "social" && !error && (
                <p className="text-sm text-emerald-600">Social media links updated.</p>
              )}

              <Field>
                <FieldLabel htmlFor="instagram_url">Instagram</FieldLabel>
                <FieldDescription>Displayed publicly in the site footer.</FieldDescription>
                <Input
                  id="instagram_url"
                  name="instagram_url"
                  type="url"
                  defaultValue={socialSettings?.instagram_url ?? ""}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="facebook_url">Facebook</FieldLabel>
                <FieldDescription>Displayed publicly in the site footer.</FieldDescription>
                <Input
                  id="facebook_url"
                  name="facebook_url"
                  type="url"
                  defaultValue={socialSettings?.facebook_url ?? ""}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="youtube_url">YouTube</FieldLabel>
                <FieldDescription>Displayed publicly in the site footer.</FieldDescription>
                <Input
                  id="youtube_url"
                  name="youtube_url"
                  type="url"
                  defaultValue={socialSettings?.youtube_url ?? ""}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="pinterest_url">Pinterest</FieldLabel>
                <FieldDescription>Displayed publicly in the site footer.</FieldDescription>
                <Input
                  id="pinterest_url"
                  name="pinterest_url"
                  type="url"
                  defaultValue={socialSettings?.pinterest_url ?? ""}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="linkedin_url">LinkedIn</FieldLabel>
                <FieldDescription>Displayed publicly in the site footer.</FieldDescription>
                <Input
                  id="linkedin_url"
                  name="linkedin_url"
                  type="url"
                  defaultValue={socialSettings?.linkedin_url ?? ""}
                />
              </Field>

              <Button type="submit">Save social links</Button>
            </FieldGroup>
          </form>
        )}
      </section>
    </div>
  );
}
