import "server-only";
import { revalidateTag, updateTag } from "next/cache";
import { PUBLIC_CACHE_TAG } from "@/lib/public-data";

/** Marks every cached public read (and the pages rendered from them) stale
 * after an admin write. Public pages revalidate once a day, so this is what
 * makes an edit visible - it replaces the old 60s polling window. Server
 * Actions only (updateTag); route handlers use `revalidatePublicContentFromRoute`. */
export function revalidatePublicContent() {
  updateTag(PUBLIC_CACHE_TAG);
}

export function revalidatePublicContentFromRoute() {
  revalidateTag(PUBLIC_CACHE_TAG, "max");
}
