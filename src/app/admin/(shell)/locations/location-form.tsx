"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GalleryUploader } from "@/components/admin/gallery-uploader";
import { FaqEditor } from "@/components/admin/faq-editor";
import { ExtraDetailFields, type ExtraDetailsValue } from "@/components/admin/extra-detail-fields";
import { ActionButtonFields, type ActionButtonValue } from "@/components/admin/action-button-fields";
import { GeoSelector } from "@/components/admin/geo-selector";
import { Field, FieldGroup, FieldLabel, FieldError, FieldSeparator } from "@/components/ui/field";
import { slugify } from "@/lib/slug";

type Location = ExtraDetailsValue & ActionButtonValue & {
  id: string;
  name: string;
  card_name: string | null;
  slug: string;
  description: string | null;
  category_id: string | null;
  country_id: string | null;
  state_id: string | null;
  city_name?: string;
  pricing_type: "free" | "paid" | "unknown";
  price: number | null;
  price_note: string | null;
  meta_title: string | null;
  meta_description: string | null;
  map_url: string | null;
  latitude: number | null;
  longitude: number | null;
  youtube_url: string | null;
  is_published: boolean;
  images?: string[];
  faqs?: { question: string; answer: string }[];
};

type Option = { id: string; name: string };
type State = Option & { country_id: string };

export function LocationForm({
  action,
  location,
  categories,
  countries,
  states,
  error,
}: {
  action: (formData: FormData) => void;
  location?: Location;
  categories: Option[];
  countries: Option[];
  states: State[];
  error?: string;
}) {
  const [name, setName] = useState(location?.name ?? "");
  const [cardName, setCardName] = useState(location?.card_name ?? "");
  const [slug, setSlug] = useState(location?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(false);
  const [pricingType, setPricingType] = useState(location?.pricing_type ?? "unknown");

  function handleCardNameChange(value: string) {
    setCardName(value);
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
            onChange={(e) => setName(e.target.value)}
            required
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="card_name">Card Place Name</FieldLabel>
          <Input
            id="card_name"
            name="card_name"
            value={cardName}
            onChange={(e) => handleCardNameChange(e.target.value)}
            placeholder="Shorter name shown on location cards"
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
            defaultValue={location?.description ?? ""}
            rows={3}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="category_id">Category</FieldLabel>
          <Select
            name="category_id"
            items={categories.map((category) => ({ value: category.id, label: category.name }))}
            defaultValue={location?.category_id ?? undefined}
            required
          >
            <SelectTrigger id="category_id" className="w-full">
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <GeoSelector
          countries={countries}
          states={states}
          defaultCountryId={location?.country_id ?? undefined}
          defaultStateId={location?.state_id ?? undefined}
          defaultCityName={location?.city_name}
        />

        <Field>
          <FieldLabel htmlFor="pricing_type">Pricing</FieldLabel>
          <Select
            name="pricing_type"
            items={[
              { value: "free", label: "Free" },
              { value: "paid", label: "Paid" },
              { value: "unknown", label: "Unknown" },
            ]}
            value={pricingType}
            onValueChange={(value) => setPricingType(value as typeof pricingType)}
            required
          >
            <SelectTrigger id="pricing_type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="free">Free</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {pricingType === "paid" && (
          <Field>
            <FieldLabel htmlFor="price">Price (₹)</FieldLabel>
            <Input
              id="price"
              name="price"
              type="number"
              min="1"
              step="1"
              defaultValue={location?.price ?? ""}
              required
            />
          </Field>
        )}

        <Field>
          <FieldLabel htmlFor="map_url">Google Maps URL</FieldLabel>
          <Input id="map_url" name="map_url" defaultValue={location?.map_url ?? ""} />
        </Field>

        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="latitude">Latitude</FieldLabel>
            <Input
              id="latitude"
              name="latitude"
              type="number"
              step="any"
              defaultValue={location?.latitude ?? ""}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="longitude">Longitude</FieldLabel>
            <Input
              id="longitude"
              name="longitude"
              type="number"
              step="any"
              defaultValue={location?.longitude ?? ""}
            />
          </Field>
        </Field>

        <Field>
          <FieldLabel htmlFor="youtube_url">YouTube URL</FieldLabel>
          <Input id="youtube_url" name="youtube_url" defaultValue={location?.youtube_url ?? ""} />
        </Field>

        <ActionButtonFields defaultValue={location} />

        <ExtraDetailFields
          defaultValue={location}
          priceNote={{ defaultValue: location?.price_note }}
        />

        <Field>
          <FieldLabel>Images</FieldLabel>
          <GalleryUploader
            kind="locations"
            slug={slug}
            name="images"
            defaultValue={location?.images}
          />
        </Field>

        <FieldSeparator>FAQs</FieldSeparator>

        <Field>
          <FieldLabel>Frequently Asked Questions</FieldLabel>
          <FaqEditor defaultValue={location?.faqs} />
        </Field>

        <FieldSeparator>SEO</FieldSeparator>

        <Field>
          <FieldLabel htmlFor="meta_title">Title Tag</FieldLabel>
          <Input
            id="meta_title"
            name="meta_title"
            defaultValue={location?.meta_title ?? ""}
            placeholder="Shown as the page title in Google search results"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="meta_description">Meta Description</FieldLabel>
          <Textarea
            id="meta_description"
            name="meta_description"
            defaultValue={location?.meta_description ?? ""}
            placeholder="Shown as the page summary in Google search results"
            rows={2}
          />
        </Field>

        <Field orientation="horizontal">
          <FieldLabel htmlFor="is_published">Published</FieldLabel>
          <Switch
            id="is_published"
            name="is_published"
            defaultChecked={location?.is_published ?? false}
          />
        </Field>

        <Button type="submit">{location ? "Save changes" : "Create location"}</Button>
      </FieldGroup>
    </form>
  );
}
