import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedPhotographerUser } from "@/lib/supabase/require-photographer";
import { absoluteUrl } from "@/lib/jsonld";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { deleteLocationCollection } from "./actions";
import { MAX_SHARE_LOCATIONS } from "./constants";
import { CopyLinkButton } from "./share-location-client";

export const metadata: Metadata = {
  title: "Share Location",
  robots: { index: false, follow: false },
};

type CollectionRow = {
  id: string;
  name: string;
  share_token: string;
  photographer_location_collection_locations: { count: number }[];
};

export default async function ShareLocationListPage() {
  const photographer = await getAuthorizedPhotographerUser();
  if (!photographer) redirect("/photographer");

  // RLS limits this to the photographer's own rows; the explicit filter is
  // defense in depth. The embedded count avoids a query per collection.
  const supabase = await createClient();
  const { data } = await supabase
    .from("photographer_location_collections")
    .select("id, name, share_token, photographer_location_collection_locations(count)")
    .eq("photographer_id", photographer.id)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as CollectionRow[];
  const atLimit = rows.length >= MAX_SHARE_LOCATIONS;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold sm:text-3xl">Share Location</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Curate location lists for your clients and share them with one link. {rows.length}/
            {MAX_SHARE_LOCATIONS} links used.
          </p>
        </div>
        {atLimit ? (
          <Button size="sm" disabled className="w-fit">
            Create Location Share
          </Button>
        ) : (
          <Button render={<Link href="/photographer/share-location/new" />} size="sm" className="w-fit">
            Create Location Share
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center">
          <MapPin className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">No share links yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a location share to send a curated list of locations to a client.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((row) => {
            const count = row.photographer_location_collection_locations[0]?.count ?? 0;
            const url = absoluteUrl(`/c/${row.share_token}`);
            return (
              <Card key={row.id}>
                <CardHeader>
                  <CardTitle className="break-words">{row.name}</CardTitle>
                  <CardDescription>
                    {count} location{count === 1 ? "" : "s"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <p className="truncate rounded-md bg-muted px-3 py-2 font-mono text-xs">{url}</p>
                  <div className="flex flex-wrap gap-2">
                    <CopyLinkButton url={url} />
                    <Button
                      render={<Link href={`/photographer/share-location/${row.id}/edit`} />}
                      size="sm"
                      variant="outline"
                    >
                      Edit
                    </Button>
                    <form action={deleteLocationCollection}>
                      <input type="hidden" name="collection_id" value={row.id} />
                      <ConfirmSubmitButton
                        size="sm"
                        variant="destructive"
                        confirmMessage={`Delete "${row.name}"? The shared link will stop working.`}
                      >
                        Delete
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
