import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ImageUploader } from "@/components/admin/image-uploader";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";

export type GeoPageRecord = {
  image_url: string | null;
  h1_title: string | null;
  meta_title: string | null;
  meta_description: string | null;
};

/** Shared SEO/banner edit form for the Country/State/City page admin
 * sections — each is a read-only-name record (countries/states are seeded,
 * cities are auto-created from location entry) that only exists as a real
 * public page once a location is published there, so there's no create
 * flow here, only editing the page's banner/H1/SEO overrides. */
export function GeoPageForm({
  action,
  record,
  imageKind,
  imageSlug,
  pageUrl,
  defaultH1,
  error,
}: {
  action: (formData: FormData) => void;
  record?: GeoPageRecord;
  imageKind: "countries" | "states" | "cities";
  imageSlug: string;
  pageUrl: string;
  defaultH1: string;
  error?: string;
}) {
  return (
    <form action={action} className="max-w-lg">
      <FieldGroup>
        {error && <FieldError>{error}</FieldError>}

        <Field>
          <FieldLabel>Public Page</FieldLabel>
          <Link
            href={pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-pb-brand hover:underline"
          >
            {pageUrl}
          </Link>
        </Field>

        <Field>
          <FieldLabel>Banner Image</FieldLabel>
          <ImageUploader
            kind={imageKind}
            slug={imageSlug}
            name="image_url"
            defaultValue={record?.image_url}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="h1_title">Page Heading (H1)</FieldLabel>
          <Input
            id="h1_title"
            name="h1_title"
            defaultValue={record?.h1_title ?? ""}
            placeholder={defaultH1}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="meta_title">Title Tag</FieldLabel>
          <Input
            id="meta_title"
            name="meta_title"
            defaultValue={record?.meta_title ?? ""}
            placeholder="Shown as the page title in Google search results"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="meta_description">Meta Description</FieldLabel>
          <Textarea
            id="meta_description"
            name="meta_description"
            defaultValue={record?.meta_description ?? ""}
            placeholder="Shown as the page summary in Google search results"
            rows={2}
          />
        </Field>

        <Button type="submit">Save changes</Button>
      </FieldGroup>
    </form>
  );
}
