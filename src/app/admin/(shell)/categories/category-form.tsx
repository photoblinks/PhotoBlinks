"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ImageUploader } from "@/components/admin/image-uploader";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { slugify } from "@/lib/slug";

type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
};

export function CategoryForm({
  action,
  category,
  defaultSortOrder,
  error,
}: {
  action: (formData: FormData) => void;
  category?: Category;
  defaultSortOrder?: number;
  error?: string;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(false);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  return (
    <form action={action} className="max-w-lg">
      <FieldGroup>
        {error && <FieldError>{error}</FieldError>}

        <Field>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input
            id="name"
            name="name"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            required
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="slug">Slug</FieldLabel>
          <Input
            id="slug"
            name="slug"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            required
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="description">Description</FieldLabel>
          <Textarea
            id="description"
            name="description"
            defaultValue={category?.description ?? ""}
            rows={3}
          />
        </Field>

        <Field>
          <FieldLabel>Image</FieldLabel>
          <ImageUploader
            kind="categories"
            slug={slug}
            name="image_url"
            defaultValue={category?.image_url}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="sort_order">Sort order</FieldLabel>
          <Input
            id="sort_order"
            name="sort_order"
            type="number"
            defaultValue={category?.sort_order ?? defaultSortOrder ?? 0}
          />
        </Field>

        <Field orientation="horizontal">
          <FieldLabel htmlFor="is_active">Active</FieldLabel>
          <Switch id="is_active" name="is_active" defaultChecked={category?.is_active ?? true} />
        </Field>

        <Button type="submit">{category ? "Save changes" : "Create category"}</Button>
      </FieldGroup>
    </form>
  );
}
