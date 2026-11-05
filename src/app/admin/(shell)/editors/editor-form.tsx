import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ImageUploader } from "@/components/admin/image-uploader";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";

export type EditorRecord = {
  name: string;
  slug: string;
  role_title: string | null;
  bio: string | null;
  image_url: string | null;
  instagram_url: string | null;
  youtube_url: string | null;
  x_url: string | null;
  linkedin_url: string | null;
  facebook_url: string | null;
  website_url: string | null;
  is_default: boolean;
};

const SOCIAL_FIELDS = [
  { name: "instagram_url", label: "Instagram URL" },
  { name: "youtube_url", label: "YouTube URL" },
  { name: "x_url", label: "X (Twitter) URL" },
  { name: "linkedin_url", label: "LinkedIn URL" },
  { name: "facebook_url", label: "Facebook URL" },
  { name: "website_url", label: "Website URL" },
] as const;

/** Create / edit form for an editor (author) profile. */
export function EditorForm({
  action,
  editor,
  error,
}: {
  action: (formData: FormData) => void;
  editor?: EditorRecord;
  error?: string;
}) {
  return (
    <form action={action} className="max-w-xl">
      <FieldGroup>
        {error && <FieldError>{error}</FieldError>}

        <Field>
          <FieldLabel>Photo</FieldLabel>
          <ImageUploader kind="site" slug="editors" name="image_url" defaultValue={editor?.image_url} />
        </Field>

        <Field>
          <FieldLabel htmlFor="name">Name *</FieldLabel>
          <Input id="name" name="name" defaultValue={editor?.name ?? ""} required />
        </Field>

        <Field>
          <FieldLabel htmlFor="slug">URL slug</FieldLabel>
          <Input id="slug" name="slug" defaultValue={editor?.slug ?? ""} placeholder="Auto-generated from the name" />
        </Field>

        <Field>
          <FieldLabel htmlFor="role_title">Role / title</FieldLabel>
          <Input
            id="role_title"
            name="role_title"
            defaultValue={editor?.role_title ?? ""}
            placeholder="e.g. Pre-wedding photography editor"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="bio">Short write-up</FieldLabel>
          <Textarea
            id="bio"
            name="bio"
            rows={5}
            defaultValue={editor?.bio ?? ""}
            placeholder="Experience and expertise — why readers can trust this editor."
          />
        </Field>

        <p className="text-sm font-medium">Social accounts</p>
        {SOCIAL_FIELDS.map((field) => (
          <Field key={field.name}>
            <FieldLabel htmlFor={field.name}>{field.label}</FieldLabel>
            <Input
              id={field.name}
              name={field.name}
              type="url"
              placeholder="https://"
              defaultValue={editor?.[field.name] ?? ""}
            />
          </Field>
        ))}

        <Field orientation="horizontal">
          <Checkbox id="is_default" name="is_default" defaultChecked={editor?.is_default ?? false} />
          <FieldLabel htmlFor="is_default">Site default editor — credited on content with no editor chosen</FieldLabel>
        </Field>

        <Button type="submit">{editor ? "Save changes" : "Create editor"}</Button>
      </FieldGroup>
    </form>
  );
}
