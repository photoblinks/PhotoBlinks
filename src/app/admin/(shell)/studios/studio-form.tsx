"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { GalleryUploader } from "@/components/admin/gallery-uploader";
import { PricingOptionsEditor } from "@/components/admin/pricing-options-editor";
import { ExtraDetailFields, type ExtraDetailsValue } from "@/components/admin/extra-detail-fields";
import { ActionButtonFields, type ActionButtonValue } from "@/components/admin/action-button-fields";
import { GeoSelector } from "@/components/admin/geo-selector";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { slugify } from "@/lib/slug";

type Studio = ExtraDetailsValue & ActionButtonValue & {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  country_id: string | null;
  state_id: string | null;
  city_name?: string;
  map_url: string | null;
  latitude: number | null;
  longitude: number | null;
  youtube_url: string | null;
  is_published: boolean;
  images?: string[];
  pricingOptions?: { label: string; price: number }[];
};

type Option = { id: string; name: string };
type State = Option & { country_id: string };

export function StudioForm({
  action,
  studio,
  countries,
  states,
  error,
}: {
  action: (formData: FormData) => void;
  studio?: Studio;
  countries: Option[];
  states: State[];
  error?: string;
}) {
  const [name, setName] = useState(studio?.name ?? "");
  const [slug, setSlug] = useState(studio?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(false);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  return (
    <form action={action} className="max-w-2xl">
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
            defaultValue={studio?.description ?? ""}
            rows={3}
          />
        </Field>

        <GeoSelector
          countries={countries}
          states={states}
          defaultCountryId={studio?.country_id ?? undefined}
          defaultStateId={studio?.state_id ?? undefined}
          defaultCityName={studio?.city_name}
        />

        <Field>
          <FieldLabel htmlFor="map_url">Google Maps URL</FieldLabel>
          <Input id="map_url" name="map_url" defaultValue={studio?.map_url ?? ""} />
        </Field>

        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="latitude">Latitude</FieldLabel>
            <Input
              id="latitude"
              name="latitude"
              type="number"
              step="any"
              defaultValue={studio?.latitude ?? ""}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="longitude">Longitude</FieldLabel>
            <Input
              id="longitude"
              name="longitude"
              type="number"
              step="any"
              defaultValue={studio?.longitude ?? ""}
            />
          </Field>
        </Field>

        <Field>
          <FieldLabel htmlFor="youtube_url">YouTube URL</FieldLabel>
          <Input id="youtube_url" name="youtube_url" defaultValue={studio?.youtube_url ?? ""} />
        </Field>

        <ActionButtonFields defaultValue={studio} />

        <ExtraDetailFields defaultValue={studio} />

        <Field>
          <FieldLabel>Images</FieldLabel>
          <GalleryUploader kind="studios" slug={slug} name="images" defaultValue={studio?.images} />
        </Field>

        <Field>
          <FieldLabel>Pricing options</FieldLabel>
          <PricingOptionsEditor defaultValue={studio?.pricingOptions} />
        </Field>

        <Field orientation="horizontal">
          <FieldLabel htmlFor="is_published">Published</FieldLabel>
          <Switch
            id="is_published"
            name="is_published"
            defaultChecked={studio?.is_published ?? false}
          />
        </Field>

        <Button type="submit">{studio ? "Save changes" : "Create studio"}</Button>
      </FieldGroup>
    </form>
  );
}
