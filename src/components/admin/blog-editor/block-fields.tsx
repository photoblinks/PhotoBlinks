"use client";

import { useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { uploadFileToR2 } from "@/lib/r2/upload-client";
import { LocationPicker } from "./location-picker";
import { LocationMultiPicker } from "./location-multi-picker";
import type {
  Block,
  HeadingBlock,
  ParagraphBlock,
  ListBlock,
  QuoteBlock,
  ImageBlockT,
  GalleryBlockT,
  FaqBlockT,
  LocationLinkBlock,
  LocationInfoTableBlock,
  CtaBlock,
  SpacerBlock,
} from "./types";

type Patch<T> = (patch: Partial<T>) => void;

/** Auto-growing textarea for the canvas's title/heading/paragraph/quote
 * fields — a lightweight stand-in for Gutenberg's contentEditable feel,
 * without a rich-text library: a plain controlled <textarea> that resizes
 * to fit its content via the `field-sizing: content` CSS (supported in the
 * Chromium versions this admin panel targets) with a manual JS fallback. */
function AutoGrow({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        e.target.style.height = "auto";
        e.target.style.height = `${e.target.scrollHeight}px`;
      }}
      placeholder={placeholder}
      rows={1}
      className={`w-full resize-none overflow-hidden border-none bg-transparent p-0 outline-none [field-sizing:content] placeholder:text-muted-foreground/60 ${className}`}
    />
  );
}

export function BlockFields({
  block,
  slug,
  locations,
  onChange,
}: {
  block: Block;
  slug: string;
  locations: { id: string; name: string }[];
  onChange: (patch: Partial<Block>) => void;
}) {
  switch (block.type) {
    case "heading":
      return (
        <div className="flex items-start gap-2">
          <Select
            items={[{ value: "2", label: "H2" }, { value: "3", label: "H3" }]}
            value={String(block.level)}
            onValueChange={(v) => (onChange as Patch<HeadingBlock>)({ level: Number(v) as 2 | 3 })}
          >
            <SelectTrigger size="sm" className="mt-0.5 w-16 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">H2</SelectItem>
              <SelectItem value="3">H3</SelectItem>
            </SelectContent>
          </Select>
          <AutoGrow
            value={block.text}
            onChange={(text) => (onChange as Patch<HeadingBlock>)({ text })}
            placeholder={block.level === 2 ? "Heading" : "Subheading"}
            className={block.level === 2 ? "font-heading text-2xl font-semibold" : "font-heading text-xl font-semibold"}
          />
        </div>
      );

    case "paragraph":
      return (
        <AutoGrow
          value={block.text}
          onChange={(text) => (onChange as Patch<ParagraphBlock>)({ text })}
          placeholder="Start writing…"
          className="text-base leading-relaxed"
        />
      );

    case "list":
      return (
        <div className="flex flex-col gap-2">
          <Select
            items={[{ value: "unordered", label: "Bulleted" }, { value: "ordered", label: "Numbered" }]}
            value={block.style}
            onValueChange={(v) => (onChange as Patch<ListBlock>)({ style: v as "ordered" | "unordered" })}
          >
            <SelectTrigger size="sm" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unordered">Bulleted</SelectItem>
              <SelectItem value="ordered">Numbered</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex flex-col gap-1.5">
            {block.items.map((item, itemIndex) => (
              <div key={itemIndex} className="flex items-center gap-2">
                <span className="text-muted-foreground">{block.style === "ordered" ? `${itemIndex + 1}.` : "•"}</span>
                <Input
                  value={item}
                  placeholder={`List item ${itemIndex + 1}`}
                  onChange={(e) =>
                    (onChange as Patch<ListBlock>)({
                      items: block.items.map((it, i) => (i === itemIndex ? e.target.value : it)),
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      (onChange as Patch<ListBlock>)({
                        items: [...block.items.slice(0, itemIndex + 1), "", ...block.items.slice(itemIndex + 1)],
                      });
                    }
                  }}
                  className="border-none px-0 shadow-none focus-visible:ring-0"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => (onChange as Patch<ListBlock>)({ items: block.items.filter((_, i) => i !== itemIndex) })}
                  aria-label="Remove item"
                  disabled={block.items.length <= 1}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => (onChange as Patch<ListBlock>)({ items: [...block.items, ""] })}
          >
            Add item
          </Button>
        </div>
      );

    case "quote":
      return (
        <div className="flex flex-col gap-2 border-l-4 border-pb-brand/30 pl-4">
          <AutoGrow
            value={block.text}
            onChange={(text) => (onChange as Patch<QuoteBlock>)({ text })}
            placeholder="Quote text"
            className="text-lg italic"
          />
          <Input
            placeholder="Attribution (optional)"
            value={block.attribution}
            onChange={(e) => (onChange as Patch<QuoteBlock>)({ attribution: e.target.value })}
            className="border-none px-0 text-sm shadow-none focus-visible:ring-0"
          />
        </div>
      );

    case "image":
      return <ImageBlockFields block={block} slug={slug} onChange={onChange as Patch<ImageBlockT>} />;

    case "gallery":
      return <GalleryBlockFields block={block} slug={slug} onChange={onChange as Patch<GalleryBlockT>} />;

    case "faq":
      return (
        <div className="flex flex-col gap-2 rounded-md bg-muted/40 p-3">
          <Input
            placeholder="Question"
            value={block.question}
            onChange={(e) => (onChange as Patch<FaqBlockT>)({ question: e.target.value })}
            className="font-medium"
          />
          <Textarea
            placeholder="Answer"
            value={block.answer}
            onChange={(e) => (onChange as Patch<FaqBlockT>)({ answer: e.target.value })}
            rows={2}
          />
        </div>
      );

    case "locationLink":
      return (
        <div className="flex flex-col gap-2">
          <LocationPicker
            locations={locations}
            value={block.locationId}
            onChange={(locationId) => (onChange as Patch<LocationLinkBlock>)({ locationId })}
          />
          <Input
            placeholder="Link label (optional — defaults to the location name)"
            value={block.label}
            onChange={(e) => (onChange as Patch<LocationLinkBlock>)({ label: e.target.value })}
          />
        </div>
      );

    case "locationInfoTable":
      return (
        <div className="flex flex-col gap-2">
          <Input
            placeholder="Table title (optional)"
            value={block.title}
            onChange={(e) => (onChange as Patch<LocationInfoTableBlock>)({ title: e.target.value })}
          />
          <LocationMultiPicker
            locations={locations}
            value={block.locationIds}
            onChange={(locationIds) => (onChange as Patch<LocationInfoTableBlock>)({ locationIds })}
          />
          <p className="text-xs text-muted-foreground">
            Shows the configured location information fields for each selected location. Fields are
            read from the location itself at render time — never stored in this block.
          </p>
        </div>
      );

    case "cta":
      return (
        <div className="flex flex-col gap-2">
          <Input
            placeholder="Button label"
            value={block.label}
            onChange={(e) => (onChange as Patch<CtaBlock>)({ label: e.target.value })}
          />
          <Input
            placeholder="Internal link, e.g. /location/some-place or /blog"
            value={block.url}
            onChange={(e) => (onChange as Patch<CtaBlock>)({ url: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Only existing PhotoBlinks pages are allowed — external and protocol-relative links are rejected on save.
          </p>
        </div>
      );

    case "divider":
      return <hr className="border-t-2 border-dashed" />;

    case "spacer":
      return (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Spacer height</span>
          <Select
            items={[{ value: "sm", label: "Small" }, { value: "md", label: "Medium" }, { value: "lg", label: "Large" }]}
            value={block.size}
            onValueChange={(v) => (onChange as Patch<SpacerBlock>)({ size: v as "sm" | "md" | "lg" })}
          >
            <SelectTrigger size="sm" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sm">Small</SelectItem>
              <SelectItem value="md">Medium</SelectItem>
              <SelectItem value="lg">Large</SelectItem>
            </SelectContent>
          </Select>
        </div>
      );

    default: {
      const _exhaustive: never = block;
      void _exhaustive;
      return null;
    }
  }
}

function ImageBlockFields({
  block,
  slug,
  onChange,
}: {
  block: ImageBlockT;
  slug: string;
  onChange: Patch<ImageBlockT>;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!slug) {
      setError("Set the post slug first so the image can be filed under it.");
      event.target.value = "";
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const publicUrl = await uploadFileToR2("blog", slug, file);
      onChange({ url: publicUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {block.url ? (
        <div className="relative aspect-video w-full overflow-hidden rounded-md border bg-muted">
          <Image src={block.url} alt="" fill className="object-cover" unoptimized />
        </div>
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded-md border border-dashed bg-muted/40 text-sm text-muted-foreground">
          No image yet
        </div>
      )}
      <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} disabled={uploading} />
      {uploading && <p className="text-sm text-muted-foreground">Uploading…</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Input placeholder="Alt text (required)" value={block.alt} onChange={(e) => onChange({ alt: e.target.value })} />
      <Input placeholder="Caption (optional)" value={block.caption} onChange={(e) => onChange({ caption: e.target.value })} />
    </div>
  );
}

function GalleryBlockFields({
  block,
  slug,
  onChange,
}: {
  block: GalleryBlockT;
  slug: string;
  onChange: Patch<GalleryBlockT>;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFilesChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    if (!slug) {
      setError("Set the post slug first so images can be filed under it.");
      event.target.value = "";
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const uploaded = await Promise.all(
        files.map(async (file) => ({ url: await uploadFileToR2("blog", slug, file), alt: "", caption: "" })),
      );
      onChange({ images: [...block.images, ...uploaded] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  function updateImage(index: number, patch: Partial<GalleryBlockT["images"][number]>) {
    onChange({ images: block.images.map((img, i) => (i === index ? { ...img, ...patch } : img)) });
  }

  function removeImage(index: number) {
    onChange({ images: block.images.filter((_, i) => i !== index) });
  }

  return (
    <div className="flex flex-col gap-3">
      {block.images.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {block.images.map((img, index) => (
            <div key={index} className="flex flex-col gap-1.5 rounded-md border p-2">
              <div className="relative aspect-square w-full overflow-hidden rounded bg-muted">
                <Image src={img.url} alt="" fill className="object-cover" unoptimized />
              </div>
              <Input
                placeholder="Alt text (required)"
                value={img.alt}
                onChange={(e) => updateImage(index, { alt: e.target.value })}
                className="h-7 text-xs"
              />
              <Input
                placeholder="Caption"
                value={img.caption}
                onChange={(e) => updateImage(index, { caption: e.target.value })}
                className="h-7 text-xs"
              />
              <Button type="button" variant="destructive" size="xs" onClick={() => removeImage(index)}>
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}
      <Input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleFilesChange} disabled={uploading} />
      {uploading && <p className="text-sm text-muted-foreground">Uploading…</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
