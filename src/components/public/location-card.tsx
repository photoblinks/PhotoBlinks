import Link from "next/link";
import Image from "next/image";
import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatPricing } from "@/lib/format";
import type { PublicLocationCard } from "@/lib/public-data";

export function LocationCard({ location }: { location: PublicLocationCard }) {
  return (
    <Link href={`/location/${location.slug}`} className="group flex flex-col gap-2.5">
      <div className="relative aspect-4/3 overflow-hidden rounded-xl bg-muted">
        {location.primaryImageUrl ? (
          <Image
            src={location.primaryImageUrl}
            alt={location.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No image
          </div>
        )}
        <Badge
          className="absolute top-2.5 left-2.5 shadow-sm"
          variant={location.pricing_type === "free" ? "default" : "secondary"}
        >
          {formatPricing(location.pricing_type, location.price)}
        </Badge>
        <span className="absolute right-2.5 bottom-2.5 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-foreground shadow-sm backdrop-blur">
          View Details →
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        <h3 className="font-heading text-base font-semibold">{location.name}</h3>
        <p className="flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" />
          {[location.city?.name, location.state?.name].filter(Boolean).join(", ")}
        </p>
      </div>
    </Link>
  );
}
