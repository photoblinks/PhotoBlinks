import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/supabase/require-permission";
import { BlogPostForm } from "../blog-post-form";
import { createBlogPost } from "../actions";

export default async function NewBlogPostPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdminPage();

  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: categories }, { data: tags }, { data: editors }, { data: locations }] = await Promise.all([
    supabase.from("blog_categories").select("id, name").order("sort_order"),
    supabase.from("blog_tags").select("id, name").order("name"),
    supabase.from("editors").select("id, name, is_default").order("name"),
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
        editors={editors ?? []}
        error={error}
      />
    </div>
  );
}
