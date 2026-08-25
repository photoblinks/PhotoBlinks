"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uploadFileToR2 } from "@/lib/r2/upload-client";

type ImageUploaderProps = {
  kind: "categories" | "locations" | "studios" | "site";
  slug: string;
  name: string;
  defaultValue?: string | null;
  /** Tailwind classes for the preview box. Defaults to a small square. */
  previewClassName?: string;
};

/** Single-image uploader: uploads directly to R2 via a presigned URL and
 * writes the resulting public URL into a hidden input for form submission. */
export function ImageUploader({
  kind,
  slug,
  name,
  defaultValue,
  previewClassName = "h-32 w-32",
}: ImageUploaderProps) {
  const [url, setUrl] = useState<string | null>(defaultValue ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!slug) {
      setError("Enter a name first so the image can be filed under a slug.");
      event.target.value = "";
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const publicUrl = await uploadFileToR2(kind, slug, file);
      setUrl(publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={url ?? ""} />
      {url && (
        <div className={`relative overflow-hidden rounded-md border ${previewClassName}`}>
          <Image src={url} alt="" fill className="object-cover" unoptimized />
        </div>
      )}
      <Input type="file" accept="image/*" onChange={handleFileChange} disabled={uploading} />
      {uploading && <p className="text-sm text-muted-foreground">Uploading…</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {url && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => setUrl(null)}
        >
          Remove image
        </Button>
      )}
    </div>
  );
}
