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

export default async function AdminCityPagesPage() {
  const supabase = await createClient();
  const { data: locations } = await supabase
    .from("locations")
    .select("city_id")
    .eq("is_published", true);

  const counts = new Map<string, number>();
  for (const location of locations ?? []) {
    counts.set(location.city_id, (counts.get(location.city_id) ?? 0) + 1);
  }
  const cityIds = [...counts.keys()];

  const { data: cities } = cityIds.length
    ? await supabase
        .from("cities")
        .select("id, name, slug, states(slug, countries(slug))")
        .in("id", cityIds)
        .order("name")
    : { data: [] as { id: string; name: string; slug: string; states: unknown }[] };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">City Pages</h1>
        <p className="text-sm text-muted-foreground">
          Each city&apos;s SEO landing page — exists once at least one location is published
          there. Add a banner image, page heading, and SEO title/description.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>City</TableHead>
            <TableHead>URL</TableHead>
            <TableHead>Locations</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cities?.map((city) => {
            const state = Array.isArray(city.states) ? city.states[0] : city.states;
            const stateSlug = (state as { slug: string; countries: unknown } | null)?.slug ?? "";
            const countryRaw = (state as { countries: unknown } | null)?.countries;
            const country = Array.isArray(countryRaw) ? countryRaw[0] : countryRaw;
            const countrySlug = (country as { slug: string } | null)?.slug ?? "";
            const path = `/locations/${countrySlug}/${stateSlug}/${city.slug}`;
            return (
              <TableRow key={city.id}>
                <TableCell className="font-medium">{city.name}</TableCell>
                <TableCell className="text-muted-foreground">{path}</TableCell>
                <TableCell>{counts.get(city.id) ?? 0}</TableCell>
                <TableCell className="flex justify-end gap-2">
                  <Button render={<Link href={path} target="_blank" />} variant="outline" size="sm">
                    View page
                  </Button>
                  <Button
                    render={<Link href={`/admin/city-pages/${city.id}/edit`} />}
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

      {(!cities || cities.length === 0) && (
        <p className="mt-6 text-sm text-muted-foreground">
          No city pages yet — publish a location first.
        </p>
      )}
    </div>
  );
}
