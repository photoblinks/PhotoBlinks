import { requireAdminPage } from "@/lib/supabase/require-permission";
import { BlogCategoryForm } from "../blog-category-form";
import { createBlogCategory } from "../actions";

export default async function NewBlogCategoryPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdminPage();

  const { error } = await searchParams;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Add blog category</h1>
      <BlogCategoryForm action={createBlogCategory} error={error} />
    </div>
  );
}
