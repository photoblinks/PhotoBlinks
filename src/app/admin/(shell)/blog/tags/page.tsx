import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/supabase/require-permission";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteBlogTag, toggleBlogTagActive } from "./actions";

export default async function AdminBlogTagsPage() {
  await requireAdminPage();

  const supabase = await createClient();
  const { data: tags } = await supabase.from("blog_tags").select("*").order("name");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Blog Tags</h1>
        <Button render={<Link href="/admin/blog/tags/new" />}>Add tag</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tags?.map((tag) => (
            <TableRow key={tag.id}>
              <TableCell className="font-medium">{tag.name}</TableCell>
              <TableCell className="text-muted-foreground">{tag.slug}</TableCell>
              <TableCell>
                <Badge variant={tag.is_active ? "default" : "secondary"}>
                  {tag.is_active ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
              <TableCell className="flex justify-end gap-2">
                <Button render={<Link href={`/admin/blog/tags/${tag.id}/edit`} />} variant="outline" size="sm">
                  Edit
                </Button>
                <form action={toggleBlogTagActive.bind(null, tag.id, !tag.is_active)}>
                  <Button type="submit" variant="outline" size="sm">
                    {tag.is_active ? "Deactivate" : "Activate"}
                  </Button>
                </form>
                <form action={deleteBlogTag.bind(null, tag.id)}>
                  <Button type="submit" variant="destructive" size="sm">
                    Delete
                  </Button>
                </form>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {tags?.length === 0 && <p className="mt-6 text-sm text-muted-foreground">No blog tags yet.</p>}
    </div>
  );
}
