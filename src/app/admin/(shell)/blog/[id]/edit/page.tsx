import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BlogPostForm } from "../../blog-post-form";
import { updateBlogPost } from "../../actions";
import type { BlogBlockInput } from "@/components/admin/blog-content-editor";

export default async function EditBlogPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: post }, { data: categories }, { data: tags }, { data: locations }] = await Promise.all([
    supabase
      .from("blog_posts")
      .select(
        "*, blog_faqs(question, answer, sort_order), blog_post_tags(tag_id), blog_post_locations(location_id)",
      )
      .eq("id", id)
      .single(),
    supabase.from("blog_categories").select("id, name").order("sort_order"),
    supabase.from("blog_tags").select("id, name").order("name"),
    // Only published locations — see the matching comment in new/page.tsx.
    // A post already linked to a location that's since been unpublished
    // simply won't show that location as (re-)selectable here; its stored
    // id is untouched and the public renderer already excludes it too.
    supabase.from("locations").select("id, name").eq("is_published", true).order("name"),
  ]);

  if (!post) notFound();

  const faqs = [...(post.blog_faqs ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((f) => ({ question: f.question, answer: f.answer }));
  const tagIds = (post.blog_post_tags ?? []).map((t: { tag_id: string }) => t.tag_id);
  const locationIds = (post.blog_post_locations ?? []).map((l: { location_id: string }) => l.location_id);

  return (
    <div>
      <Link href="/admin/blog" className="mb-4 inline-block text-sm text-muted-foreground hover:text-foreground">
        ← Back to posts
      </Link>
      <BlogPostForm
        action={updateBlogPost.bind(null, id)}
        post={{ ...post, content: (post.content ?? []) as BlogBlockInput[], faqs, tag_ids: tagIds, location_ids: locationIds }}
        categories={categories ?? []}
        tags={tags ?? []}
        locations={locations ?? []}
        error={error}
      />
    </div>
  );
}
