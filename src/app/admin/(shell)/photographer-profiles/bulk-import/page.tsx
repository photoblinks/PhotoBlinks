import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/supabase/require-permission";
import { BulkImportForm } from "@/components/admin/bulk-import-form";

export default async function BulkImportPhotographersPage() {
  await requireAdminPage();

  const supabase = await createClient();
  const [{ data: countries }, { data: states }] = await Promise.all([
    supabase.from("countries").select("id, name").order("name"),
    supabase.from("states").select("id, name, country_id").order("name"),
  ]);

  return (
    <div className="max-w-2xl">
      <h1 className="mb-2 text-2xl font-semibold">Bulk import photographers</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Download the official Excel template, fill it in, then upload it to validate and import
        photographer profiles. The Country and State you select below apply to every row. Imported
        profiles are unclaimed drafts (on hold) until you activate them.
      </p>
      <BulkImportForm entity="photographers" countries={countries ?? []} states={states ?? []} />
    </div>
  );
}
