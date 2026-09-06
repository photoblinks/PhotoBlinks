/** Guards a user-supplied `?next=` redirect target against open-redirect
 * abuse (an absolute or protocol-relative URL pointing off-site). Only a
 * same-origin relative path is considered safe. */
export function safeNextPath(next: string | null | undefined, fallback = "/favourites") {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("://")) return fallback;
  return next;
}
