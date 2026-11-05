import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/supabase/require-permission";
import { EditorForm } from "../../editor-form";
import { updateEditor } from "../../actions";

export default async function EditEditorPage({
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
  const { data: editor } = await supabase.from("editors").select("*").eq("id", id).maybeSingle();
  if (!editor) notFound();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Edit editor — {editor.name}</h1>
      <EditorForm action={updateEditor.bind(null, id)} editor={editor} error={error} />
    </div>
  );
}
