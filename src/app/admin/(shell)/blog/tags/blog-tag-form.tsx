"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { slugify } from "@/lib/slug";

type BlogTag = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
};

export function BlogTagForm({
  action,
  tag,
  error,
}: {
  action: (formData: FormData) => void;
  tag?: BlogTag;
  error?: string;
}) {
  const [name, setName] = useState(tag?.name ?? "");
  const [slug, setSlug] = useState(tag?.slug ?? "");
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
          <Input id="name" name="name" value={name} onChange={(e) => handleNameChange(e.target.value)} required />
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

        <Field orientation="horizontal">
          <FieldLabel htmlFor="is_active">Active</FieldLabel>
          <Switch id="is_active" name="is_active" defaultChecked={tag?.is_active ?? true} />
        </Field>

        <Button type="submit">{tag ? "Save changes" : "Create tag"}</Button>
      </FieldGroup>
    </form>
  );
}
