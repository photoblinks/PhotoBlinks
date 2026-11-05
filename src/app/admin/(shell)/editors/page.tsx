import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/supabase/require-permission";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteEditor } from "./actions";

export default async function AdminEditorsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireAdminPage();
  const { error } = await searchParams;

  const supabase = await createClient();
  const { data: editors } = await supabase
    .from("editors")
    .select("id, name, slug, role_title, is_default")
    .order("name");

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Editors</h1>
          <p className="text-sm text-muted-foreground">
            Public author profiles (E-E-A-T). Shown on every blog post and editorial blog section, with their own page
            and structured data.
          </p>
        </div>
        <Button render={<Link href="/admin/editors/new" />}>New editor</Button>
      </div>

      {error && <FieldError>{error}</FieldError>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>URL</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(editors ?? []).map((editor) => (
            <TableRow key={editor.id}>
              <TableCell className="font-medium">
                {editor.name} {editor.is_default && <Badge className="ml-2">Default</Badge>}
              </TableCell>
              <TableCell>{editor.role_title ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">/editors/{editor.slug}</TableCell>
              <TableCell className="flex justify-end gap-2">
                <Button render={<Link href={`/editors/${editor.slug}`} target="_blank" />} variant="outline" size="sm">
                  View page
                </Button>
                <Button render={<Link href={`/admin/editors/${editor.id}/edit`} />} variant="outline" size="sm">
                  Edit
                </Button>
                <form action={deleteEditor.bind(null, editor.id)}>
                  <Button type="submit" variant="outline" size="sm">
                    Delete
                  </Button>
                </form>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {(editors ?? []).length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          No editors yet. Create one and tick &ldquo;Site default editor&rdquo; so it is credited everywhere.
        </p>
      )}
    </div>
  );
}
