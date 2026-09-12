import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteBlogPost, toggleBlogPostFeatured, toggleBlogPostStatus } from "./actions";

export default async function AdminBlogPage() {
  const supabase = await createClient();
  const { data: posts } = await supabase
    .from("blog_posts")
    .select("id, title, slug, status, is_featured, published_at, blog_categories(name)")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Blog Posts</h1>
        <div className="flex gap-2">
          <Button render={<Link href="/admin/blog/categories" />} variant="outline">
            Categories
          </Button>
          <Button render={<Link href="/admin/blog/tags" />} variant="outline">
            Tags
          </Button>
          <Button render={<Link href="/admin/blog/new" />}>Add post</Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Featured</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {posts?.map((post) => {
            const category = Array.isArray(post.blog_categories) ? post.blog_categories[0] : post.blog_categories;
            const nextStatus = post.status === "published" ? "draft" : "published";
            return (
              <TableRow key={post.id}>
                <TableCell className="font-medium">{post.title}</TableCell>
                <TableCell className="text-muted-foreground">{post.slug}</TableCell>
                <TableCell>{category?.name ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={post.status === "published" ? "default" : "secondary"}>
                    {post.status === "published" ? "Published" : "Draft"}
                  </Badge>
                </TableCell>
                <TableCell>{post.is_featured ? <Badge variant="outline">Featured</Badge> : "—"}</TableCell>
                <TableCell className="flex justify-end gap-2">
                  <Button render={<Link href={`/admin/blog/${post.id}/edit`} />} variant="outline" size="sm">
                    Edit
                  </Button>
                  <form action={toggleBlogPostStatus.bind(null, post.id, nextStatus)}>
                    <Button type="submit" variant="outline" size="sm">
                      {post.status === "published" ? "Unpublish" : "Publish"}
                    </Button>
                  </form>
                  <form action={toggleBlogPostFeatured.bind(null, post.id, !post.is_featured)}>
                    <Button type="submit" variant="outline" size="sm">
                      {post.is_featured ? "Unfeature" : "Feature"}
                    </Button>
                  </form>
                  <form action={deleteBlogPost.bind(null, post.id)}>
                    <Button type="submit" variant="destructive" size="sm">
                      Delete
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {posts?.length === 0 && <p className="mt-6 text-sm text-muted-foreground">No blog posts yet.</p>}
    </div>
  );
}
