import { BadgeCheck } from "lucide-react";

/** Blue "verified" tick, shown next to a photographer's studio name. Admins
 * grant it from the photographer profile admin page. */
export function VerifiedBadge({ className = "size-5" }: { className?: string }) {
  return <BadgeCheck role="img" aria-label="Verified" className={`${className} shrink-0 fill-sky-500 text-white`} />;
}
