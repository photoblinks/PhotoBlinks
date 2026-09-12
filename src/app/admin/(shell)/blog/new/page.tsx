import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BlogPostForm } from "../blog-post-form";
import { createBlogPost } from "../actions";

export default async function NewBlogPostPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: categories }, { data: tags }, { data: locations }] = await Promise.all([
    supabase.from("blog_categories").select("id, name").order("sort_order"),
    supabase.from("blog_tags").select("id, name").order("name"),
    // Only published locations — an admin can technically see every
    // location via RLS, but linking a post to an unpublished one would be a
    // dead selection: the public renderer only ever resolves locationLink
    // blocks and "related locations" against published rows anyway.
    supabase.from("locations").select("id, name").eq("is_published", true).order("name"),
  ]);

  return (
    <div>
      <Link href="/admin/blog" className="mb-4 inline-block text-sm text-muted-foreground hover:text-foreground">
        ← Back to posts
      </Link>
      <BlogPostForm
        action={createBlogPost}
        categories={categories ?? []}
        tags={tags ?? []}
        locations={locations ?? []}
        error={error}
      />
    </div>
  );
}
