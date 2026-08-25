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

function formatPricing(pricingType: string, price: number | null) {
  if (pricingType === "free") return "Free";
  if (pricingType === "paid") return price != null ? `₹${price.toLocaleString("en-IN")}` : "Paid";
  return "Unknown";
}

export default async function AdminLocationsPage() {
  const supabase = await createClient();
  const { data: locations } = await supabase
    .from("locations")
    .select(
      "*, categories(name), states(name), cities(name), location_images(image_url, sort_order)",
    )
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Locations</h1>
        <Button render={<Link href="/admin/locations/new" />}>Add location</Button>
      </div>

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
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {locations?.map((location) => {
            const primaryImage = [...(location.location_images ?? [])].sort(
              (a, b) => a.sort_order - b.sort_order,
            )[0]?.image_url;

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
