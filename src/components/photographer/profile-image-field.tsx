"use client";

import { useState } from "react";
import Image from "next/image";
import { ImagePlus } from "lucide-react";
import { uploadPhotographerFileToR2 } from "@/lib/r2/upload-client";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

/** Uploads one profile image (logo or banner) straight to R2 and submits its
 * URL through a hidden input. The server action re-validates that the URL is
 * this photographer's own upload. */
export function ProfileImageField({
  name,
  label,
  hint,
  shape,
  defaultValue,
}: {
  name: string;
  label: string;
  hint: string;
  shape: "logo" | "banner";
  defaultValue?: string | null;
}) {
  const [url, setUrl] = useState(defaultValue ?? "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return setError("Only JPEG, PNG, and WebP images are allowed.");
    if (file.size > MAX_BYTES) return setError("File is too large. Maximum size is 10 MB.");

    setUploading(true);
    setError(null);
    try {
      setUrl((await uploadPhotographerFileToR2(file, "profile")).publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  const frame = shape === "logo" ? "size-24 rounded-full" : "aspect-16/6 w-full max-w-md rounded-xl";

  return (
    <Field>
      <FieldLabel htmlFor={`${name}_file`}>{label}</FieldLabel>
      <input type="hidden" name={name} value={url} />
      <input
        id={`${name}_file`}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFile}
        disabled={uploading}
        className="sr-only"
      />
      <div className="flex flex-wrap items-center gap-3">
        <label
          htmlFor={`${name}_file`}
          className={`relative flex ${frame} shrink-0 cursor-pointer items-center justify-center overflow-hidden border-2 border-dashed text-muted-foreground transition-colors hover:border-pb-brand hover:text-pb-brand`}
        >
          {url ? (
            <Image src={url} alt={label} fill sizes="448px" className="object-cover" />
          ) : (
            <ImagePlus className="size-7" strokeWidth={1.5} />
          )}
        </label>
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">{uploading ? "Uploading…" : hint}</p>
          <div className="flex gap-2">
            <label
              htmlFor={`${name}_file`}
              className="inline-flex h-8 cursor-pointer items-center rounded-lg border px-3 text-sm font-medium hover:bg-muted"
            >
              {url ? "Replace" : "Upload"}
            </label>
            {url && (
              <Button type="button" variant="outline" size="sm" onClick={() => setUrl("")}>
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}
