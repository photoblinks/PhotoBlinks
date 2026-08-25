import { createClient } from "@/lib/supabase/server";
import { ImageUploader } from "@/components/admin/image-uploader";
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldError } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { updateHeroImage } from "./actions";

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { error, saved } = await searchParams;
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("site_settings")
    .select("hero_image_url")
    .eq("id", true)
    .single();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Settings</h1>

      <form action={updateHeroImage} className="max-w-lg">
        <FieldGroup>
          {error && <FieldError>{error}</FieldError>}
          {saved && !error && (
            <p className="text-sm text-emerald-600">Homepage banner updated.</p>
          )}

          <Field>
            <FieldLabel>Homepage Banner Image</FieldLabel>
            <FieldDescription>
              Shown as the background of the homepage hero section. Upload a wide, high-resolution
              photo for best results.
            </FieldDescription>
            <ImageUploader
              kind="site"
              slug="homepage-banner"
              name="hero_image_url"
              defaultValue={settings?.hero_image_url}
              previewClassName="aspect-video w-full max-w-md"
            />
          </Field>

          <Button type="submit">Save</Button>
        </FieldGroup>
      </form>
    </div>
  );
}
