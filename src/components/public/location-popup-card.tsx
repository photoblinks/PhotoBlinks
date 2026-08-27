import Link from "next/link";
import Image from "next/image";
import { Navigation } from "lucide-react";
import { formatPricingLabel } from "@/lib/format";
import { formatDistanceKm } from "@/lib/geo";
import type { PublicLocationCard } from "@/lib/public-data";

/** Compact preview card shown inside a map marker's popup. */
export function LocationPopupCard({ location }: { location: PublicLocationCard }) {
  return (
    <div className="flex w-60 gap-3 p-1">
      <div className="relative aspect-square w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
        {location.primaryImageUrl ? (
          <Image
            src={location.primaryImageUrl}
            alt={location.name}
            fill
            sizes="80px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[0.6rem] text-muted-foreground">
            No image
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="truncate font-heading text-sm font-semibold">{location.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[location.city?.name, location.state?.name].filter(Boolean).join(", ")}
        </p>
        {location.distanceKm != null && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Navigation className="size-3 shrink-0 text-pb-brand" />
            {formatDistanceKm(location.distanceKm)}
          </p>
        )}
        <p className="text-xs font-medium text-pb-brand">
          {location.category ? `${location.category.name} · ` : ""}
          {formatPricingLabel(location.pricing_type)}
        </p>
        <Link
          href={`/location/${location.slug}`}
          className="mt-1 text-xs font-semibold text-pb-brand hover:underline"
        >
          View Details →
        </Link>
      </div>
    </div>
  );
}
