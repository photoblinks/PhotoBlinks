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
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { slugify } from "@/lib/slug";

type Location = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category_id: string | null;
  country: string;
  state_id: string | null;
  city_id: string | null;
  pricing_type: "free" | "paid" | "unknown";
  price: number | null;
  map_url: string | null;
  latitude: number | null;
  longitude: number | null;
  youtube_url: string | null;
  is_published: boolean;
  images?: string[];
};

type Option = { id: string; name: string };
type City = Option & { state_id: string };

export function LocationForm({
  action,
  location,
  categories,
  states,
  cities,
  error,
}: {
  action: (formData: FormData) => void;
  location?: Location;
  categories: Option[];
  states: Option[];
  cities: City[];
  error?: string;
}) {
  const [name, setName] = useState(location?.name ?? "");
  const [slug, setSlug] = useState(location?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(false);
  const [stateId, setStateId] = useState(location?.state_id ?? "");
  const [cityId, setCityId] = useState(location?.city_id ?? "");
  const [pricingType, setPricingType] = useState(location?.pricing_type ?? "unknown");

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  function handleStateChange(value: string) {
    setStateId(value);
    if (!cities.some((c) => c.id === cityId && c.state_id === value)) {
      setCityId("");
    }
  }

  const citiesForState = cities.filter((c) => c.state_id === stateId);

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
            defaultValue={location?.description ?? ""}
            rows={3}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="category_id">Category</FieldLabel>
          <Select name="category_id" defaultValue={location?.category_id ?? undefined} required>
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

        <Field>
          <FieldLabel htmlFor="country">Country</FieldLabel>
          <Input id="country" name="country" defaultValue={location?.country ?? "India"} required />
        </Field>

        <Field>
          <FieldLabel htmlFor="state_id">State</FieldLabel>
          <Select
            name="state_id"
            value={stateId || undefined}
            onValueChange={(value) => handleStateChange(String(value))}
            required
          >
            <SelectTrigger id="state_id" className="w-full">
              <SelectValue placeholder="Select a state" />
            </SelectTrigger>
            <SelectContent>
              {states.map((state) => (
                <SelectItem key={state.id} value={state.id}>
                  {state.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="city_id">City</FieldLabel>
          <Select
            name="city_id"
            value={cityId || undefined}
            onValueChange={(value) => setCityId(String(value))}
            disabled={!stateId}
            required
          >
            <SelectTrigger id="city_id" className="w-full">
              <SelectValue placeholder={stateId ? "Select a city" : "Select a state first"} />
            </SelectTrigger>
            <SelectContent>
              {citiesForState.map((city) => (
                <SelectItem key={city.id} value={city.id}>
                  {city.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="pricing_type">Pricing</FieldLabel>
          <Select
            name="pricing_type"
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

        <Field>
          <FieldLabel>Images</FieldLabel>
          <GalleryUploader
            kind="locations"
            slug={slug}
            name="images"
            defaultValue={location?.images}
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
