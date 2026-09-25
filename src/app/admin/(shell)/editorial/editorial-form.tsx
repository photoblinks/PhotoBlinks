"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FieldError } from "@/components/ui/field";
import { BlogContentEditor, type BlogBlockInput } from "@/components/admin/blog-content-editor";
import { saveEditorial, toggleEditorialStatus } from "./actions";
import type { BlockType } from "@/components/admin/blog-editor/types";

const EDITORIAL_BLOCK_TYPES: readonly BlockType[] = [
  "paragraph",
  "heading2",
  "heading3",
  "list",
  "quote",
  "faq",
  "locationLink",
  "locationInfoTable",
  "cta",
  "divider",
  "spacer",
];

export type EditorialTarget = {
  scope: "state" | "state_category";
  stateId: string;
  categoryId?: string;
  /** Deterministic localStorage autosave key — never sent to the server. */
  syntheticSlug: string;
  title: string;
};

/** Shared editor for State and State + Category editorial content. Reuses
 * BlogContentEditor (and therefore LocationPicker / the block inserter)
 * without introducing a second CMS. Save never changes status — publish is
 * the separate toggle in the header. */
export function EditorialForm({
  target,
  existing,
  locations,
  error,
}: {
  target: EditorialTarget;
  existing?: { id: string; status: "draft" | "published"; content: BlogBlockInput[] };
  locations: { id: string; name: string }[];
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-heading text-2xl font-semibold">{target.title}</h1>
        {existing ? (
          <form action={toggleEditorialStatus} className="flex items-center gap-3">
            <input type="hidden" name="id" value={existing.id} />
            <input
              type="hidden"
              name="status"
              value={existing.status === "published" ? "draft" : "published"}
            />
            <Badge variant={existing.status === "published" ? "default" : "secondary"}>
              {existing.status === "published" ? "Published" : "Draft"}
            </Badge>
            <Button type="submit" size="sm" variant="outline">
              {existing.status === "published" ? "Unpublish" : "Publish"}
            </Button>
          </form>
        ) : (
          <Badge variant="secondary">New draft</Badge>
        )}
      </div>

      {error && <FieldError>{error}</FieldError>}

      <form action={saveEditorial} className="flex flex-col gap-4">
        <input type="hidden" name="scope" value={target.scope} />
        <input type="hidden" name="state_id" value={target.stateId} />
        {target.categoryId && <input type="hidden" name="category_id" value={target.categoryId} />}

        <BlogContentEditor
          name="content_json"
          slug={target.syntheticSlug}
          locations={locations}
          defaultValue={existing?.content}
          allowedBlockTypes={EDITORIAL_BLOCK_TYPES}
        />

        <div className="flex justify-end">
          <Button type="submit">{existing ? "Save changes" : "Create draft"}</Button>
        </div>
      </form>
    </div>
  );
}
