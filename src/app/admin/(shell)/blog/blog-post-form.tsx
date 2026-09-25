"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ImageUploader } from "@/components/admin/image-uploader";
import { FaqEditor } from "@/components/admin/faq-editor";
import { BlogContentEditor, type BlogBlockInput } from "@/components/admin/blog-content-editor";
import { BLOG_POST_BLOCK_TYPES } from "@/components/admin/blog-editor/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { slugify } from "@/lib/slug";
import { toggleBlogPostStatus } from "./actions";

type BlogPost = {
  id: string;
  title: string;
  slug: string;
  status: "draft" | "published";
  excerpt: string | null;
  category_id: string | null;
  author_name: string;
  featured_image_url: string | null;
  featured_image_alt: string | null;
  meta_title: string | null;
  meta_description: string | null;
  is_featured: boolean;
  published_at: string | null;
  content: BlogBlockInput[];
  faqs: { question: string; answer: string }[];
  tag_ids: string[];
  location_ids: string[];
};

/** Sidebar section — a lightweight stand-in for Gutenberg's collapsible
 * document-settings panels. Always-open (no accordion state) per the "keep
 * it lightweight" brief. */
function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b pb-4">
      <h3 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function PublishBox({ post }: { post?: BlogPost }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (!post) {
    return (
      <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
        Save this post as a draft first — publishing controls appear once it exists.
      </div>
    );
  }

  const nextStatus = post.status === "published" ? "draft" : "published";

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
      <div>
        <Badge variant={post.status === "published" ? "default" : "secondary"}>
          {post.status === "published" ? "Published" : "Draft"}
        </Badge>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await toggleBlogPostStatus(post.id, nextStatus);
            router.refresh();
          })
        }
      >
        {post.status === "published" ? "Unpublish" : "Publish now"}
      </Button>
    </div>
  );
}

export function BlogPostForm({
  action,
  post,
  categories,
  tags,
  locations,
  error,
}: {
  action: (formData: FormData) => void;
  post?: BlogPost;
  categories: { id: string; name: string }[];
  tags: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  error?: string;
}) {
  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(false);
  const [editingSlug, setEditingSlug] = useState(!post);
  const [tagIds, setTagIds] = useState<string[]>(post?.tag_ids ?? []);
  const [locationIds, setLocationIds] = useState<string[]>(post?.location_ids ?? []);

  const slugLocked = Boolean(post?.published_at);

  function handleTitleChange(value: string) {
    setTitle(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  function toggleId(list: string[], setList: (v: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  return (
    <form action={action}>
      {error && (
        <div className="mb-4">
          <FieldError>{error}</FieldError>
        </div>
      )}

      <div className="mb-6 flex items-center justify-between gap-4">
        <textarea
          value={title}
          onChange={(e) => {
            handleTitleChange(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          name="title"
          placeholder="Add title"
          rows={1}
          required
          className="font-heading w-full resize-none overflow-hidden border-none bg-transparent text-4xl font-semibold outline-none [field-sizing:content] placeholder:text-muted-foreground/50"
        />
        <Button type="submit" className="shrink-0">
          {post ? "Save changes" : "Create draft"}
        </Button>
      </div>

      <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <span>Permalink:</span>
        {editingSlug ? (
          <>
            <Input
              name="slug"
              value={slug}
              disabled={slugLocked}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              required
              className="h-7 max-w-xs"
            />
            <Button type="button" size="xs" variant="outline" onClick={() => setEditingSlug(false)}>
              Done
            </Button>
          </>
        ) : (
          <>
            <input type="hidden" name="slug" value={slug} />
            <code className="rounded bg-muted px-1.5 py-0.5">/blog/{slug || "…"}</code>
            {!slugLocked && (
              <Button type="button" size="xs" variant="ghost" onClick={() => setEditingSlug(true)}>
                Edit
              </Button>
            )}
          </>
        )}
        {slugLocked && <span className="text-xs">(locked — post has been published)</span>}
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <BlogContentEditor
            name="content_json"
            slug={slug}
            locations={locations}
            defaultValue={post?.content}
            allowedBlockTypes={BLOG_POST_BLOCK_TYPES}
          />
        </div>

        <aside className="flex w-full flex-col gap-4 lg:w-80 lg:shrink-0">
          <PublishBox post={post} />

          <FieldGroup>
            <SidebarSection title="Post">
              <Field>
                <FieldLabel htmlFor="category_id">Category</FieldLabel>
                <Select
                  name="category_id"
                  items={categories.map((c) => ({ value: c.id, label: c.name }))}
                  defaultValue={post?.category_id ?? undefined}
                >
                  <SelectTrigger id="category_id" className="w-full">
                    <SelectValue placeholder="No category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel htmlFor="author_name">Author name</FieldLabel>
                <Input id="author_name" name="author_name" defaultValue={post?.author_name ?? ""} required />
              </Field>

              <Field orientation="horizontal">
                <FieldLabel htmlFor="is_featured">Featured post</FieldLabel>
                <Switch id="is_featured" name="is_featured" defaultChecked={post?.is_featured ?? false} />
              </Field>
            </SidebarSection>

            <SidebarSection title="Excerpt">
              <Textarea name="excerpt" defaultValue={post?.excerpt ?? ""} rows={3} placeholder="Short summary shown on /blog and in search results" />
            </SidebarSection>

            <SidebarSection title="Featured Image">
              <ImageUploader kind="blog" slug={slug} name="featured_image_url" defaultValue={post?.featured_image_url} />
              <Input
                placeholder="Alt text"
                name="featured_image_alt"
                defaultValue={post?.featured_image_alt ?? ""}
              />
            </SidebarSection>

            <SidebarSection title="SEO">
              <Field>
                <FieldLabel htmlFor="meta_title">Title tag</FieldLabel>
                <Input id="meta_title" name="meta_title" defaultValue={post?.meta_title ?? ""} />
              </Field>
              <Field>
                <FieldLabel htmlFor="meta_description">Meta description</FieldLabel>
                <Textarea id="meta_description" name="meta_description" defaultValue={post?.meta_description ?? ""} rows={2} />
              </Field>
            </SidebarSection>

            <SidebarSection title="Tags">
              <div className="flex flex-wrap gap-3">
                {tags.map((tag) => (
                  <label key={tag.id} className="flex items-center gap-1.5 text-sm">
                    <Checkbox checked={tagIds.includes(tag.id)} onCheckedChange={() => toggleId(tagIds, setTagIds, tag.id)} />
                    {tag.name}
                  </label>
                ))}
                {tagIds.map((id) => (
                  <input key={id} type="hidden" name="tag_ids" value={id} />
                ))}
                {tags.length === 0 && <p className="text-sm text-muted-foreground">No tags yet.</p>}
              </div>
            </SidebarSection>

            <SidebarSection title="Related Locations">
              <div className="flex max-h-56 flex-col gap-2 overflow-y-auto rounded-md border p-2">
                {locations.map((location) => (
                  <label key={location.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={locationIds.includes(location.id)}
                      onCheckedChange={() => toggleId(locationIds, setLocationIds, location.id)}
                    />
                    {location.name}
                  </label>
                ))}
                {locationIds.map((id) => (
                  <input key={id} type="hidden" name="location_ids" value={id} />
                ))}
                {locations.length === 0 && <p className="text-sm text-muted-foreground">No published locations available.</p>}
              </div>
            </SidebarSection>

            <SidebarSection title="Structured FAQs">
              <p className="-mt-1 text-xs text-muted-foreground">
                Powers this post&apos;s FAQPage schema — separate from any FAQ blocks in the article body.
              </p>
              <FaqEditor defaultValue={post?.faqs} />
            </SidebarSection>
          </FieldGroup>
        </aside>
      </div>
    </form>
  );
}
