import "server-only";
import { revalidateTag, updateTag } from "next/cache";
import { PUBLIC_CACHE_TAG } from "@/lib/public-data";

/** Marks the cached public reads carrying any of `tags` (and the pages
 * rendered from them) stale after an admin write. Public pages revalidate
 * weekly/daily, so this is what makes an edit visible. Pass only the tag of
 * what changed (CACHE_TAGS, locationTag(), sponsoredStateTag() in
 * public-data.ts). Server Actions only (updateTag); route handlers use
 * `revalidatePublicContentFromRoute`. */
export function revalidatePublicContent(...tags: [string, ...string[]]) {
  for (const tag of tags) updateTag(tag);
}

export function revalidatePublicContentFromRoute(...tags: [string, ...string[]]) {
  for (const tag of tags) revalidateTag(tag, "max");
}

/** Every cached public read carries PUBLIC_CACHE_TAG; this is the escape
 * hatch for changes made outside the admin actions (direct SQL, imports). */
export function purgeAllPublicContent() {
  updateTag(PUBLIC_CACHE_TAG);
}
