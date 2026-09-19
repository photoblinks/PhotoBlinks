import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/supabase/require-permission";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteBlogCategory, toggleBlogCategoryActive } from "./actions";

export default async function AdminBlogCategoriesPage() {
  await requireAdminPage();

  const supabase = await createClient();
  const { data: categories } = await supabase.from("blog_categories").select("*").order("sort_order");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Blog Categories</h1>
        <Button render={<Link href="/admin/blog/categories/new" />}>Add category</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Sort order</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {categories?.map((category) => (
            <TableRow key={category.id}>
              <TableCell className="font-medium">{category.name}</TableCell>
              <TableCell className="text-muted-foreground">{category.slug}</TableCell>
              <TableCell>{category.sort_order}</TableCell>
              <TableCell>
                <Badge variant={category.is_active ? "default" : "secondary"}>
                  {category.is_active ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
              <TableCell className="flex justify-end gap-2">
                <Button render={<Link href={`/admin/blog/categories/${category.id}/edit`} />} variant="outline" size="sm">
                  Edit
                </Button>
                <form action={toggleBlogCategoryActive.bind(null, category.id, !category.is_active)}>
                  <Button type="submit" variant="outline" size="sm">
                    {category.is_active ? "Deactivate" : "Activate"}
                  </Button>
                </form>
                <form action={deleteBlogCategory.bind(null, category.id)}>
                  <Button type="submit" variant="destructive" size="sm">
                    Delete
                  </Button>
                </form>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {categories?.length === 0 && <p className="mt-6 text-sm text-muted-foreground">No blog categories yet.</p>}
    </div>
  );
}
