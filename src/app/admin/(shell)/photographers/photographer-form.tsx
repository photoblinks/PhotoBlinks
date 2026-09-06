"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageUploader } from "@/components/admin/image-uploader";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { slugify } from "@/lib/slug";

type Photographer = {
  id: string;
  photography_name: string;
  image_url: string;
  title: string;
  description: string | null;
  phone_number: string;
  whatsapp_number: string;
  state_id: string;
  expiry_date: string;
};

type State = { id: string; name: string };

export function PhotographerForm({
  action,
  photographer,
  states,
  error,
}: {
  action: (formData: FormData) => void;
  photographer?: Photographer;
  /** Already excludes states with another active assignment (the current
   * record's own state, if editing, is always included). */
  states: State[];
  error?: string;
}) {
  const [photographyName, setPhotographyName] = useState(photographer?.photography_name ?? "");

  return (
    <form action={action} className="max-w-2xl">
      <FieldGroup>
        {error && <FieldError>{error}</FieldError>}

        <Field>
          <FieldLabel htmlFor="photography_name">Photography Name</FieldLabel>
          <Input
            id="photography_name"
            name="photography_name"
            value={photographyName}
            onChange={(e) => setPhotographyName(e.target.value)}
            required
          />
        </Field>

        <Field>
          <FieldLabel>Image</FieldLabel>
          <ImageUploader
            kind="photographers"
            slug={slugify(photographyName) || photographer?.id || ""}
            name="image_url"
            defaultValue={photographer?.image_url}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="title">Title</FieldLabel>
          <Input id="title" name="title" defaultValue={photographer?.title ?? ""} required />
        </Field>

        <Field>
          <FieldLabel htmlFor="description">Short Description</FieldLabel>
          <Textarea
            id="description"
            name="description"
            defaultValue={photographer?.description ?? ""}
            rows={3}
          />
        </Field>

        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="phone_number">Phone Number</FieldLabel>
            <Input
              id="phone_number"
              name="phone_number"
              type="tel"
              defaultValue={photographer?.phone_number ?? ""}
              placeholder="+91 98765 43210"
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="whatsapp_number">WhatsApp Number</FieldLabel>
            <Input
              id="whatsapp_number"
              name="whatsapp_number"
              type="tel"
              defaultValue={photographer?.whatsapp_number ?? ""}
              placeholder="+91 98765 43210"
              required
            />
          </Field>
        </Field>

        <Field>
          <FieldLabel htmlFor="state_id">State</FieldLabel>
          <Select
            name="state_id"
            items={states.map((state) => ({ value: state.id, label: state.name }))}
            defaultValue={photographer?.state_id ?? undefined}
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
          {states.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Every state already has an active sponsored photographer.
            </p>
          )}
        </Field>

        <Field>
          <FieldLabel htmlFor="expiry_date">Expiry Date</FieldLabel>
          <Input
            id="expiry_date"
            name="expiry_date"
            type="date"
            defaultValue={photographer?.expiry_date ?? ""}
            required
          />
        </Field>

        <Button type="submit">{photographer ? "Save changes" : "Add photographer"}</Button>
      </FieldGroup>
    </form>
  );
}
