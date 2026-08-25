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
import { deleteStudio, toggleStudioPublished } from "./actions";

export default async function AdminStudiosPage() {
  const supabase = await createClient();
  const { data: studios } = await supabase
    .from("studios")
    .select("*, states(name), cities(name), studio_images(image_url, sort_order)")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Studios</h1>
        <Button render={<Link href="/admin/studios/new" />}>Add studio</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Image</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>State</TableHead>
            <TableHead>City</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {studios?.map((studio) => {
            const primaryImage = [...(studio.studio_images ?? [])].sort(
              (a, b) => a.sort_order - b.sort_order,
            )[0]?.image_url;

            return (
              <TableRow key={studio.id}>
                <TableCell>
                  {primaryImage ? (
                    <div className="relative h-10 w-10 overflow-hidden rounded">
                      <Image src={primaryImage} alt="" fill className="object-cover" unoptimized />
                    </div>
                  ) : (
                    <div className="h-10 w-10 rounded bg-muted" />
                  )}
                </TableCell>
                <TableCell className="font-medium">{studio.name}</TableCell>
                <TableCell className="text-muted-foreground">{studio.states?.name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{studio.cities?.name ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={studio.is_published ? "default" : "secondary"}>
                    {studio.is_published ? "Published" : "Unpublished"}
                  </Badge>
                </TableCell>
                <TableCell className="flex justify-end gap-2">
                  <Button
                    render={<Link href={`/admin/studios/${studio.id}/edit`} />}
                    variant="outline"
                    size="sm"
                  >
                    Edit
                  </Button>
                  <form action={toggleStudioPublished.bind(null, studio.id, !studio.is_published)}>
                    <Button type="submit" variant="outline" size="sm">
                      {studio.is_published ? "Unpublish" : "Publish"}
                    </Button>
                  </form>
                  <form action={deleteStudio.bind(null, studio.id)}>
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

      {studios?.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">No studios yet.</p>
      )}
    </div>
  );
}
