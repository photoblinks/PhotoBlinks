"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { uploadFileToR2 } from "@/lib/r2/upload-client";

type GalleryUploaderProps = {
  kind: "locations" | "studios";
  slug: string;
  name: string;
  defaultValue?: string[];
};

/** Multi-image uploader: uploads each file to R2 via a presigned URL, and
 * lets the admin reorder, remove, and pick the primary (first) image. The
 * ordered URLs are submitted as repeated hidden inputs sharing `name`. */
export function GalleryUploader({ kind, slug, name, defaultValue }: GalleryUploaderProps) {
  const [images, setImages] = useState<string[]>(defaultValue ?? []);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFilesChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    if (!slug) {
      setError("Enter a name first so images can be filed under a slug.");
      event.target.value = "";
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const uploaded = await Promise.all(files.map((file) => uploadFileToR2(kind, slug, file)));
      setImages((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  function removeAt(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  function move(index: number, direction: -1 | 1) {
    setImages((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return next;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function makePrimary(index: number) {
    setImages((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.unshift(item);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {images.map((url) => (
        <input type="hidden" name={name} value={url} key={url} />
      ))}

      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {images.map((url, index) => (
            <div key={url} className="flex flex-col gap-1">
              <div className="relative aspect-square overflow-hidden rounded-md border">
                <Image src={url} alt="" fill className="object-cover" unoptimized />
                {index === 0 && (
                  <Badge className="absolute top-1 left-1" variant="default">
                    Primary
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  aria-label="Move earlier"
                >
                  ←
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  disabled={index === images.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label="Move later"
                >
                  →
                </Button>
                {index !== 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => makePrimary(index)}
                  >
                    Make primary
                  </Button>
                )}
                <Button
                  type="button"
                  variant="destructive"
                  size="icon-xs"
                  onClick={() => removeAt(index)}
                  aria-label="Remove image"
                >
                  ×
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Input type="file" accept="image/*" multiple onChange={handleFilesChange} disabled={uploading} />
      {uploading && <p className="text-sm text-muted-foreground">Uploading…</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
