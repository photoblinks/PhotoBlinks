"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedPhotographerUser } from "@/lib/supabase/require-photographer";
import { MAX_SHARE_LOCATIONS } from "./constants";

// Ownership is never taken from the client: the acting photographer comes
// from the server session, and every table write is additionally enforced by
// RLS + the collection-limit trigger (see
// 20260915000000_photographer_location_collections.sql).

const MAX_LOCATIONS_PER_SHARE = 25;
const LIST_PATH = "/photographer/share-location";

const nameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name for this share.")
  .max(100, "Name must be 100 characters or fewer.");

const saveSchema = z.object({
  collectionId: z.string().uuid().nullable(),
  name: nameSchema,
  locationIds: z
    .array(z.string().uuid("Invalid location."))
    .min(1, "Add at least one location.")
    .max(MAX_LOCATIONS_PER_SHARE, `A share can contain at most ${MAX_LOCATIONS_PER_SHARE} locations.`)
    .refine((ids) => new Set(ids).size === ids.length, "A location can only be added once."),
});

export type ShareLocationResult = { error?: string; name?: string };

function firstIssue(err: unknown) {
  return err instanceof z.ZodError ? err.issues[0].message : "Invalid input.";
}

async function countOwnCollections(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { count } = await supabase
    .from("photographer_location_collections")
    .select("id", { count: "exact", head: true })
    .eq("photographer_id", userId);
  return count ?? 0;
}

/** Step 1 of creating a share: validates the name (and that the photographer
 * still has room for another share) before the location picker opens. The
 * name is validated again on save — this is only an early, friendly check. */
export async function validateShareName(name: string): Promise<ShareLocationResult> {
  const photographer = await getAuthorizedPhotographerUser();
  if (!photographer) redirect("/sign-in/photographer");

  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  if ((await countOwnCollections(supabase, photographer.id)) >= MAX_SHARE_LOCATIONS) {
    return { error: `You can have at most ${MAX_SHARE_LOCATIONS} share links. Delete one to create another.` };
  }
  return { name: parsed.data };
}

/** Creates (collectionId null) or updates a share. Editing keeps the existing
 * share_token, so the already-shared link keeps working. */
export async function saveLocationCollection(input: {
  collectionId: string | null;
  name: string;
  locationIds: string[];
}): Promise<ShareLocationResult> {
  const photographer = await getAuthorizedPhotographerUser();
  if (!photographer) redirect("/sign-in/photographer");

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { collectionId, name, locationIds } = parsed.data;

  const supabase = await createClient();

  if (!collectionId && (await countOwnCollections(supabase, photographer.id)) >= MAX_SHARE_LOCATIONS) {
    return { error: `You can have at most ${MAX_SHARE_LOCATIONS} share links. Delete one to create another.` };
  }

  // A new token per attempt; only a create ever stores it. Retries cover an
  // astronomically unlikely unique collision on share_token.
  let error: { code?: string; message: string } | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    ({ error } = await supabase.rpc("save_photographer_location_collection", {
      p_collection_id: collectionId,
      p_name: name,
      p_share_token: randomBytes(32).toString("base64url"),
      p_location_ids: locationIds,
    }));
    if (!error || collectionId || error.code !== "23505" || !error.message.includes("share_token")) break;
  }

  if (error) {
    if (error.message.includes("share_location_limit_reached")) {
      return { error: `You can have at most ${MAX_SHARE_LOCATIONS} share links. Delete one to create another.` };
    }
    if (error.message.includes("too_many_locations")) {
      return { error: `A share can contain at most ${MAX_LOCATIONS_PER_SHARE} locations.` };
    }
    if (error.message.includes("location_not_published")) {
      return { error: "One or more selected locations are no longer available. Remove them and try again." };
    }
    if (error.message.includes("collection_not_found")) {
      return { error: "This share link no longer exists." };
    }
    if (error.message.includes("duplicate_location")) {
      return { error: "A location can only be added once." };
    }
    console.error("[saveLocationCollection] failed:", error.message);
    return { error: "Could not save this share. Please try again." };
  }

  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}

/** Deletes one of the current photographer's shares. Child location rows
 * cascade; the token stops resolving immediately. */
export async function deleteLocationCollection(formData: FormData): Promise<void> {
  const photographer = await getAuthorizedPhotographerUser();
  if (!photographer) redirect("/sign-in/photographer");

  const parsed = z.string().uuid().safeParse(String(formData.get("collection_id") ?? ""));
  if (!parsed.success) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("photographer_location_collections")
    .delete()
    .eq("id", parsed.data)
    .eq("photographer_id", photographer.id);
  if (error) console.error("[deleteLocationCollection] failed:", error.message);

  revalidatePath(LIST_PATH);
}
