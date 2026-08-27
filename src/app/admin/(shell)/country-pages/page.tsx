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

export default async function AdminCountryPagesPage() {
  const supabase = await createClient();
  const { data: locations } = await supabase
    .from("locations")
    .select("country_id")
    .eq("is_published", true);

  const counts = new Map<string, number>();
  for (const location of locations ?? []) {
    counts.set(location.country_id, (counts.get(location.country_id) ?? 0) + 1);
  }
  const countryIds = [...counts.keys()];

  const { data: countries } = countryIds.length
    ? await supabase
        .from("countries")
        .select("id, name, slug")
        .in("id", countryIds)
        .order("name")
    : { data: [] as { id: string; name: string; slug: string }[] };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Country Pages</h1>
        <p className="text-sm text-muted-foreground">
          Each country&apos;s SEO landing page — exists once at least one location is published
          there. Add a banner image, page heading, and SEO title/description.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Country</TableHead>
            <TableHead>URL</TableHead>
            <TableHead>Locations</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {countries?.map((country) => {
            const path = `/locations/${country.slug}`;
            return (
              <TableRow key={country.id}>
                <TableCell className="font-medium">{country.name}</TableCell>
                <TableCell className="text-muted-foreground">{path}</TableCell>
                <TableCell>{counts.get(country.id) ?? 0}</TableCell>
                <TableCell className="flex justify-end gap-2">
                  <Button render={<Link href={path} target="_blank" />} variant="outline" size="sm">
                    View page
                  </Button>
                  <Button
                    render={<Link href={`/admin/country-pages/${country.id}/edit`} />}
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

      {(!countries || countries.length === 0) && (
        <p className="mt-6 text-sm text-muted-foreground">
          No country pages yet — publish a location first.
        </p>
      )}
    </div>
  );
}
