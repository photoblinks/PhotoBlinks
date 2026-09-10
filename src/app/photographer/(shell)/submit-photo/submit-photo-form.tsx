"use client";

import { useState, useActionState } from "react";
import Image from "next/image";
import { submitPhoto, type SubmitPhotoState } from "./actions";
import { uploadPhotographerFileToR2 } from "@/lib/r2/upload-client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { AuthSubmitButton } from "@/components/public/auth-submit-button";
import { Button } from "@/components/ui/button";

type Location = { id: string; name: string };

type Props = {
  locations: Location[];
  defaultPhone: string;
};

// UX-only client-side checks — the real security boundary stays server-side:
// /api/photographer/r2-presign re-validates type/size before issuing a
// presigned URL, and submitPhoto re-validates every field before inserting.
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB — mirrors the server limit.

export function SubmitPhotoForm({ locations, defaultPhone }: Props) {
  // Server-action state. useActionState keeps the form mounted when the action
  // resolves, so an in-place validation error never unmounts this component —
  // which is exactly what preserves the uploaded R2 object (storage_key /
  // image_url) and the photographer's typed title/description below.
  const [state, formAction, isPending] = useActionState(submitPhoto, {});

  const [storageKey, setStorageKey] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [photoRequiredError, setPhotoRequiredError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoRequiredError(null);

    // Client-side file checks (convenience only — the presign endpoint
    // re-validates both on the server before any R2 write).
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setUploadError("Unsupported file type. Only JPEG, PNG, and WebP images are allowed.");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setUploadError("File is too large. Maximum size is 10 MB.");
      e.target.value = "";
      return;
    }

    setUploading(true);
    setUploadError(null);
    setStorageKey("");
    setImageUrl("");
    try {
      const result = await uploadPhotographerFileToR2(file);
      setStorageKey(result.storageKey);
      setImageUrl(result.publicUrl);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function clearPhoto() {
    setStorageKey("");
    setImageUrl("");
    setUploadError(null);
    setPhotoRequiredError(null);
  }

  // Runs before the server action. Enforces "photo required" — the file input
  // is deliberately cleared after a successful upload, so the photo is tracked
  // via state, not the input's value — and blocks a duplicate submission while
  // one is in flight. Nothing here replaces the server: the action re-validates
  // all fields, and the DB unique constraint on storage_key is the
  // authoritative duplicate guard.
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (isPending) {
      e.preventDefault();
      return;
    }
    if (!storageKey || !imageUrl) {
      e.preventDefault();
      setPhotoRequiredError(
        uploading ? "The photo is still uploading — please wait." : "Please upload a photo first.",
      );
    }
  }

  if (state.success) {
    return (
      <div className="mt-8 rounded-md bg-green-50 px-4 py-6 text-center dark:bg-green-950/30">
        <p className="font-medium text-green-800 dark:text-green-300">Photo submitted successfully!</p>
        <p className="mt-1 text-sm text-green-700 dark:text-green-400">
          Your photo will be reviewed before it appears publicly. Approval isn&apos;t automatic — an
          admin will review it, and you can check its status on your dashboard.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => {
            setStorageKey("");
            setImageUrl("");
            setUploadError(null);
            setPhotoRequiredError(null);
            window.location.href = "/photographer/submit-photo";
          }}
        >
          Submit another photo
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-8" onSubmit={handleSubmit}>
      <input type="hidden" name="storage_key" value={storageKey} />
      <input type="hidden" name="image_url" value={imageUrl} />

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="location_id">Location *</FieldLabel>
          <select
            id="location_id"
            name="location_id"
            required
            disabled={isPending}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Select a location</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
        </Field>

        <Field>
          <FieldLabel>Photo *</FieldLabel>
          {imageUrl ? (
            <div className="flex flex-col gap-2">
              <div className="relative h-48 w-full overflow-hidden rounded-md border">
                <Image src={imageUrl} alt="Preview" fill className="object-cover" unoptimized />
              </div>
              <Button type="button" variant="outline" size="sm" className="w-fit" onClick={clearPhoto} disabled={isPending}>
                Remove photo
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                disabled={uploading || isPending}
              />
              {uploading && <p className="text-sm text-muted-foreground">Uploading…</p>}
              {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
              {photoRequiredError && <p className="text-sm text-destructive">{photoRequiredError}</p>}
            </div>
          )}
        </Field>

        <Field>
          <FieldLabel htmlFor="title">Title *</FieldLabel>
          <Input
            id="title"
            name="title"
            maxLength={120}
            required
            disabled={isPending}
            placeholder="e.g. Golden hour at Kovalam Beach"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="description">Short Description</FieldLabel>
          <Textarea
            id="description"
            name="description"
            maxLength={500}
            disabled={isPending}
            placeholder="Optional — describe the shot, best time to visit, or what makes this spot special (max 500 characters)"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="phone_number">Contact Phone *</FieldLabel>
          <Input
            id="phone_number"
            name="phone_number"
            type="tel"
            defaultValue={defaultPhone}
            required
            disabled={isPending}
          />
        </Field>

        {state.error && <FieldError>{state.error}</FieldError>}

        <AuthSubmitButton
          label="Submit photo"
          pendingLabel="Submitting…"
        />
      </FieldGroup>
    </form>
  );
}
