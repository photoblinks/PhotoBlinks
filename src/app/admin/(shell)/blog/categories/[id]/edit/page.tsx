import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BlogCategoryForm } from "../../blog-category-form";
import { updateBlogCategory } from "../../actions";

export default async function EditBlogCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const { data: category } = await supabase.from("blog_categories").select("*").eq("id", id).single();
  if (!category) notFound();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Edit blog category</h1>
      <BlogCategoryForm action={updateBlogCategory.bind(null, id)} category={category} error={error} />
    </div>
  );
}
