import { requireAdminPage } from "@/lib/supabase/require-permission";
import { EditorForm } from "../editor-form";
import { createEditor } from "../actions";

export default async function NewEditorPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireAdminPage();
  const { error } = await searchParams;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">New editor</h1>
      <EditorForm action={createEditor} error={error} />
    </div>
  );
}
