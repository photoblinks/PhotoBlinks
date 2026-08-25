import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPricing } from "@/lib/format";
import type { PublicLocationCard } from "@/lib/public-data";

/** Compact preview card shown inside a map marker's popup. */
export function LocationPopupCard({ location }: { location: PublicLocationCard }) {
  return (
    <div className="flex w-56 flex-col gap-2">
      <div className="relative aspect-4/3 overflow-hidden rounded-md bg-muted">
        {location.primaryImageUrl ? (
          <Image
            src={location.primaryImageUrl}
            alt={location.name}
            fill
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No image
          </div>
        )}
      </div>
      <div>
        <p className="font-medium">{location.name}</p>
        <p className="text-xs text-muted-foreground">
          {[location.city?.name, location.state?.name].filter(Boolean).join(", ")}
        </p>
        <div className="mt-1 flex items-center gap-1.5">
          {location.category && <Badge variant="secondary">{location.category.name}</Badge>}
          <Badge variant={location.pricing_type === "free" ? "default" : "secondary"}>
            {formatPricing(location.pricing_type, location.price)}
          </Badge>
        </div>
      </div>
      <Button render={<Link href={`/location/${location.slug}`} />} size="sm" className="w-full">
        View Location
      </Button>
    </div>
  );
}
