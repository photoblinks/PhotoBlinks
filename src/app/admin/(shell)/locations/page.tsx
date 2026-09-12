import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteLocation, toggleLocationPublished } from "./actions";
import { formatPricing } from "@/lib/format";
import { isSeoEligible, seoEligibilityLabel } from "@/lib/seo-eligibility";
import { AdminListFilters } from "@/components/admin/admin-list-filters";

export default async function AdminLocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; country?: string; state?: string; city?: string; category?: string }>;
}) {
  const { q, country, state, city, category } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("locations")
    .select(
      "*, categories(name, slug), states(name), cities(name, slug), location_images(image_url, sort_order)",
    )
    .order("created_at", { ascending: false });

  if (q) query = query.ilike("name", `%${q}%`);
  if (country) query = query.eq("country_id", country);
  if (state) query = query.eq("state_id", state);
  if (city) query = query.eq("city_id", city);
  if (category) query = query.eq("category_id", category);

  const [{ data: locations }, { data: publishedForSeo }, { data: countries }, { data: states }, { data: categories }, { data: allLocationsForFilters }] =
    await Promise.all([
      query,
      // One grouped aggregate — not one query per row — for the City +
      // Category SEO eligibility count shown alongside each location. Same
      // rule as the Phase 3 inventory (src/lib/seo-eligibility.ts).
      supabase.from("locations").select("city_id, category_id").eq("is_published", true),
      supabase.from("countries").select("id, name").order("name"),
      supabase.from("states").select("id, name, country_id").order("name"),
      supabase.from("categories").select("id, name").order("sort_order"),
      // Unfiltered, so the City dropdown always offers every city that has
      // at least one location, regardless of the currently applied filters.
      supabase.from("locations").select("cities(id, name, state_id)"),
    ]);

  const seoCounts = new Map<string, number>();
  for (const location of publishedForSeo ?? []) {
    if (!location.city_id || !location.category_id) continue;
    const key = `${location.city_id}|${location.category_id}`;
    seoCounts.set(key, (seoCounts.get(key) ?? 0) + 1);
  }

  const cityOptions = new Map<string, { id: string; name: string; state_id: string }>();
  for (const location of allLocationsForFilters ?? []) {
    const cityRef = Array.isArray(location.cities) ? location.cities[0] : location.cities;
    if (cityRef) cityOptions.set(cityRef.id, cityRef);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Locations</h1>
        <Button render={<Link href="/admin/locations/new" />}>Add location</Button>
      </div>

      <AdminListFilters
        basePath="/admin/locations"
        countries={countries ?? []}
        states={states ?? []}
        cities={[...cityOptions.values()]}
        categories={categories ?? []}
        initial={{ q, country, state, city, category }}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Image</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>State</TableHead>
            <TableHead>City</TableHead>
            <TableHead>Pricing</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>SEO</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {locations?.map((location) => {
            const primaryImage = [...(location.location_images ?? [])].sort(
              (a, b) => a.sort_order - b.sort_order,
            )[0]?.image_url;

            const categorySlug = location.categories?.slug;
            const citySlug = location.cities?.slug;
            const seoCount =
              location.city_id && location.category_id
                ? (seoCounts.get(`${location.city_id}|${location.category_id}`) ?? 0)
                : null;
            const seoHref =
              citySlug && categorySlug
                ? `/admin/seo/location-categories?city=${citySlug}&category=${categorySlug}`
                : undefined;

            return (
              <TableRow key={location.id}>
                <TableCell>
                  {primaryImage ? (
                    <div className="relative h-10 w-10 overflow-hidden rounded">
                      <Image src={primaryImage} alt="" fill className="object-cover" unoptimized />
                    </div>
                  ) : (
                    <div className="h-10 w-10 rounded bg-muted" />
                  )}
                </TableCell>
                <TableCell className="font-medium">{location.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {location.categories?.name ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {location.states?.name ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {location.cities?.name ?? "—"}
                </TableCell>
                <TableCell>{formatPricing(location.pricing_type, location.price)}</TableCell>
                <TableCell>
                  <Badge variant={location.is_published ? "default" : "secondary"}>
                    {location.is_published ? "Published" : "Unpublished"}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {seoCount === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <Badge
                      render={seoHref ? <Link href={seoHref} /> : undefined}
                      variant={isSeoEligible(seoCount) ? "default" : "secondary"}
                    >
                      {seoCount} location{seoCount === 1 ? "" : "s"} · {seoEligibilityLabel(seoCount)}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="flex justify-end gap-2">
                  <Button
                    render={<Link href={`/admin/locations/${location.id}/edit`} />}
                    variant="outline"
                    size="sm"
                  >
                    Edit
                  </Button>
                  <form
                    action={toggleLocationPublished.bind(null, location.id, !location.is_published)}
                  >
                    <Button type="submit" variant="outline" size="sm">
                      {location.is_published ? "Unpublish" : "Publish"}
                    </Button>
                  </form>
                  <form action={deleteLocation.bind(null, location.id)}>
                    <Button type="submit" variant="destructive" size="sm">
                      Delete
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {locations?.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">No locations yet.</p>
      )}
    </div>
  );
}
