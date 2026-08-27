import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function AdminStatePagesPage() {
  const supabase = await createClient();
  const { data: locations } = await supabase
    .from("locations")
    .select("state_id")
    .eq("is_published", true);

  const counts = new Map<string, number>();
  for (const location of locations ?? []) {
    counts.set(location.state_id, (counts.get(location.state_id) ?? 0) + 1);
  }
  const stateIds = [...counts.keys()];

  const { data: states } = stateIds.length
    ? await supabase
        .from("states")
        .select("id, name, slug, countries(slug)")
        .in("id", stateIds)
        .order("name")
    : { data: [] as { id: string; name: string; slug: string; countries: unknown }[] };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">State Pages</h1>
        <p className="text-sm text-muted-foreground">
          Each state&apos;s SEO landing page — exists once at least one location is published
          there. Add a banner image, page heading, and SEO title/description.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>State</TableHead>
            <TableHead>URL</TableHead>
            <TableHead>Locations</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {states?.map((state) => {
            const country = Array.isArray(state.countries) ? state.countries[0] : state.countries;
            const countrySlug = (country as { slug: string } | null)?.slug ?? "";
            const path = `/locations/${countrySlug}/${state.slug}`;
            return (
              <TableRow key={state.id}>
                <TableCell className="font-medium">{state.name}</TableCell>
                <TableCell className="text-muted-foreground">{path}</TableCell>
                <TableCell>{counts.get(state.id) ?? 0}</TableCell>
                <TableCell className="flex justify-end gap-2">
                  <Button render={<Link href={path} target="_blank" />} variant="outline" size="sm">
                    View page
                  </Button>
                  <Button
                    render={<Link href={`/admin/state-pages/${state.id}/edit`} />}
                    variant="outline"
                    size="sm"
                  >
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {(!states || states.length === 0) && (
        <p className="mt-6 text-sm text-muted-foreground">
          No state pages yet — publish a location first.
        </p>
      )}
    </div>
  );
}
