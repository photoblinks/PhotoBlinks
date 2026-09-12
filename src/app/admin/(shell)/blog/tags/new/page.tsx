import { BlogTagForm } from "../blog-tag-form";
import { createBlogTag } from "../actions";

export default async function NewBlogTagPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Add blog tag</h1>
      <BlogTagForm action={createBlogTag} error={error} />
    </div>
  );
}
