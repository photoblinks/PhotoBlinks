import Link from "next/link";
import { requireAdminPage } from "@/lib/supabase/require-permission";
import { getPublicPhotographers } from "@/lib/public-data";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function AdminPhotographerStateSeoPage() {
  await requireAdminPage();

  const supabase = await createClient();
  const [photographers, { data: states }] = await Promise.all([
    getPublicPhotographers(),
    supabase.from("states").select("id, slug, countries(slug)"),
  ]);

  const stateIds = new Map<string, string>(
    (states ?? []).map((s) => {
      const country = Array.isArray(s.countries) ? s.countries[0] : s.countries;
      return [`${country?.slug}/${s.slug}`, s.id];
    }),
  );

  const rows = new Map<string, { name: string; path: string; id: string | undefined; count: number }>();
  for (const p of photographers) {
    const key = `${p.country.slug}/${p.state.slug}`;
    const row = rows.get(key);
    if (row) row.count += 1;
    else rows.set(key, { name: p.state.name, path: `/photographers/${key}`, id: stateIds.get(key), count: 1 });
  }
  const list = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Photography State SEO</h1>
        <p className="text-sm text-muted-foreground">
          Each state&apos;s photographer page — exists once a photographer is listed there. Set the banner, heading,
          SEO title/description and blog.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>State</TableHead>
            <TableHead>URL</TableHead>
            <TableHead>Photographers</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((row) => (
            <TableRow key={row.path}>
              <TableCell className="font-medium">{row.name}</TableCell>
              <TableCell className="text-muted-foreground">{row.path}</TableCell>
              <TableCell>{row.count}</TableCell>
              <TableCell className="flex justify-end gap-2">
                <Button render={<Link href={row.path} target="_blank" />} variant="outline" size="sm">
                  View page
                </Button>
                {row.id && (
                  <Button render={<Link href={`/admin/photographer-state-seo/${row.id}/edit`} />} variant="outline" size="sm">
                    Edit
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {list.length === 0 && <p className="mt-6 text-sm text-muted-foreground">No photographers listed yet.</p>}
    </div>
  );
}
