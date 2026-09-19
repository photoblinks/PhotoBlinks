import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/supabase/require-permission";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteBlogPost, toggleBlogPostFeatured, toggleBlogPostStatus } from "./actions";
import { AdminPagination } from "@/components/admin/pagination";
import { ADMIN_PAGE_SIZE, parsePage, rangeFor } from "@/lib/admin/pagination";

export default async function AdminBlogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdminPage();

  const { page: pageParam } = await searchParams;
  const supabase = await createClient();

  // Count first: the data query's range depends on the page clamped to this
  // total, so it can't run in parallel without risking an out-of-range page
  // silently returning an empty page — same rule as Phase B1.
  const { count } = await supabase.from("blog_posts").select("id", { count: "exact", head: true });
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const currentPage = parsePage(pageParam, totalPages);
  const { from, to } = rangeFor(currentPage);

  const { data: posts } = await supabase
    .from("blog_posts")
    .select("id, title, slug, status, is_featured, published_at, blog_categories(name)")
    .order("created_at", { ascending: false })
    .range(from, to);

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

      <AdminPagination
        hrefFor={(page) => `/admin/blog?page=${page}`}
        currentPage={currentPage}
        totalPages={totalPages}
        total={total}
        pageSize={ADMIN_PAGE_SIZE}
      />
    </div>
  );
}
