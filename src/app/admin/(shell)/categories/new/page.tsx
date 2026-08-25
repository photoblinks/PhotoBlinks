import { createClient } from "@/lib/supabase/server";
import { CategoryForm } from "../category-form";
import { createCategory } from "../actions";

export default async function NewCategoryPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { count } = await supabase
    .from("categories")
    .select("*", { count: "exact", head: true });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Add category</h1>
      <CategoryForm action={createCategory} defaultSortOrder={count ?? 0} error={error} />
    </div>
  );
}
