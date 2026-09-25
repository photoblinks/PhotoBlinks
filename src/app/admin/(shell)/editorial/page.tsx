import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/supabase/require-permission";
import { getLocationInfoTableConfig } from "@/lib/public-data";
import { Badge } from "@/components/ui/badge";
import { FieldError } from "@/components/ui/field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LocationInfoTableConfigForm } from "./location-info-table-config-form";

type EditorialRow = {
  id: string;
  scope: "state" | "state_category";
  state_id: string;
  category_id: string | null;
  status: "draft" | "published";
};

type InventoryRpcRow = {
  state_id: string;
  category_id: string;
  state_name: string;
  category_name: string;
  location_count: number;
};

function StatusBadge({ status }: { status?: "draft" | "published" }) {
  if (!status) return <span className="text-sm text-muted-foreground">—</span>;
  return <Badge variant={status === "published" ? "default" : "secondary"}>{status}</Badge>;
}

export default async function EditorialAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdminPage();

  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: states }, { data: editorialRows }, { data: inventoryData }, config] = await Promise.all([
    supabase.from("states").select("id, name, slug").eq("is_active", true).order("name"),
    supabase.from("location_editorial").select("id, scope, state_id, category_id, status"),
    supabase.rpc("get_admin_seo_location_state_category_inventory", {
      p_q: null,
      p_country_slug: null,
      p_state_slug: null,
      p_category_slug: null,
      p_sort: "state",
      p_dir: "asc",
      p_limit: 500,
      p_offset: 0,
    }),
    getLocationInfoTableConfig(),
  ]);

  const statusByKey = new Map<string, "draft" | "published">();
  for (const row of (editorialRows ?? []) as EditorialRow[]) {
    const key =
      row.scope === "state" ? `state:${row.state_id}` : `state_category:${row.state_id}:${row.category_id}`;
    statusByKey.set(key, row.status);
  }

  const combos = (inventoryData ?? []) as InventoryRpcRow[];

  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-heading text-2xl font-semibold">Editorial Content</h1>

      {error && <FieldError>{error}</FieldError>}

      <section>
        <h2 className="font-heading mb-3 text-lg font-semibold">Location Information Table Settings</h2>
        <LocationInfoTableConfigForm config={config} />
      </section>

      <section>
        <h2 className="font-heading mb-3 text-lg font-semibold">State Pages</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>State</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(states ?? []).map((state) => (
              <TableRow key={state.id}>
                <TableCell className="font-medium">{state.name}</TableCell>
                <TableCell>
                  <StatusBadge status={statusByKey.get(`state:${state.id}`)} />
                </TableCell>
                <TableCell>
                  <Link href={`/admin/editorial/state/${state.id}/edit`} className="text-pb-brand hover:underline">
                    Edit
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section>
        <h2 className="font-heading mb-3 text-lg font-semibold">State + Category Pages</h2>
        {combos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No State + Category combinations with published locations yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>State</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Locations</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {combos.map((combo) => (
                <TableRow key={`${combo.state_id}|${combo.category_id}`}>
                  <TableCell className="font-medium">{combo.state_name}</TableCell>
                  <TableCell>{combo.category_name}</TableCell>
                  <TableCell>{Number(combo.location_count)}</TableCell>
                  <TableCell>
                    <StatusBadge status={statusByKey.get(`state_category:${combo.state_id}:${combo.category_id}`)} />
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/editorial/state/${combo.state_id}/${combo.category_id}/edit`}
                      className="text-pb-brand hover:underline"
                    >
                      Edit
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
