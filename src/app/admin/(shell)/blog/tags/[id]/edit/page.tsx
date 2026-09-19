import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/supabase/require-permission";
import { BlogTagForm } from "../../blog-tag-form";
import { updateBlogTag } from "../../actions";

export default async function EditBlogTagPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdminPage();

  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const { data: tag } = await supabase.from("blog_tags").select("*").eq("id", id).single();
  if (!tag) notFound();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Edit blog tag</h1>
      <BlogTagForm action={updateBlogTag.bind(null, id)} tag={tag} error={error} />
    </div>
  );
}
