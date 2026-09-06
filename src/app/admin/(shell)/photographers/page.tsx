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
import { deletePhotographer } from "./actions";

export default async function AdminPhotographersPage() {
  const supabase = await createClient();
  const { data: photographers } = await supabase
    .from("sponsored_photographers")
    .select("*, states(name)")
    .order("created_at", { ascending: false });

  // Display-only — the actual active/expired boundary is enforced server-side
  // by the sponsored_photographers_public_read RLS policy and the state-
  // uniqueness trigger (both compare against Postgres current_date), not by
  // this client-visible computation.
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sponsored Photographers</h1>
        <Button render={<Link href="/admin/photographers/new" />}>Add photographer</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Image</TableHead>
            <TableHead>Photography Name</TableHead>
            <TableHead>State</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Expiry Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {photographers?.map((photographer) => {
            const isActive = photographer.expiry_date >= todayIso;

            return (
              <TableRow key={photographer.id}>
                <TableCell>
                  {photographer.image_url ? (
                    <div className="relative h-10 w-10 overflow-hidden rounded">
                      <Image
                        src={photographer.image_url}
                        alt=""
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                  ) : (
                    <div className="h-10 w-10 rounded bg-muted" />
                  )}
                </TableCell>
                <TableCell className="font-medium">{photographer.photography_name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {photographer.states?.name ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">{photographer.title}</TableCell>
                <TableCell className="text-muted-foreground">{photographer.expiry_date}</TableCell>
                <TableCell>
                  <Badge variant={isActive ? "default" : "secondary"}>
                    {isActive ? "Active" : "Expired"}
                  </Badge>
                </TableCell>
                <TableCell className="flex justify-end gap-2">
                  <Button
                    render={<Link href={`/admin/photographers/${photographer.id}/edit`} />}
                    variant="outline"
                    size="sm"
                  >
                    Edit
                  </Button>
                  <Button
                    render={<Link href={`/admin/photographers/${photographer.id}/analytics`} />}
                    variant="outline"
                    size="sm"
                  >
                    Analytics
                  </Button>
                  <form action={deletePhotographer.bind(null, photographer.id)}>
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

      {photographers?.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">No sponsored photographers yet.</p>
      )}
    </div>
  );
}
