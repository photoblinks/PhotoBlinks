import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { formatPricing } from "@/lib/format";
import type { PublicLocationCard } from "@/lib/public-data";

export function LocationCard({ location }: { location: PublicLocationCard }) {
  return (
    <Link
      href={`/location/${location.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-4/3 bg-muted">
        {location.primaryImageUrl ? (
          <Image
            src={location.primaryImageUrl}
            alt={location.name}
            fill
            className="object-cover transition-transform group-hover:scale-105"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No image
          </div>
        )}
        <Badge className="absolute top-2 right-2" variant={location.pricing_type === "free" ? "default" : "secondary"}>
          {formatPricing(location.pricing_type, location.price)}
        </Badge>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="font-medium">{location.name}</h3>
        <p className="text-sm text-muted-foreground">
          {[location.city?.name, location.state?.name].filter(Boolean).join(", ")}
        </p>
        <span className="mt-auto pt-2 text-sm font-medium text-primary group-hover:underline">
          View Details →
        </span>
      </div>
    </Link>
  );
}
