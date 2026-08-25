import Link from "next/link";
import Image from "next/image";
import { Globe, ArrowRight } from "lucide-react";
import { formatPricing } from "@/lib/format";
import type { PublicLocationCard } from "@/lib/public-data";

export function LocationCard({ location }: { location: PublicLocationCard }) {
  return (
    <Link href={`/location/${location.slug}`} className="group flex flex-col gap-3">
      <div className="relative aspect-4/3 overflow-hidden rounded-2xl bg-muted">
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
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-20 bg-linear-to-t from-black/50 to-transparent"
        />
        <span className="absolute top-3 left-3 rounded-full bg-black/60 px-3.5 py-1.5 text-sm font-[250] text-white backdrop-blur-sm">
          {formatPricing(location.pricing_type, location.price)}
        </span>
        <span className="absolute right-3 bottom-3 flex items-center gap-1 text-sm font-[250] text-white">
          View Details
          <ArrowRight className="size-4" strokeWidth={2} />
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="font-sans text-lg font-[450] text-foreground">{location.name}</h3>
        <p className="flex items-center gap-1.5 text-sm font-[220] text-muted-foreground">
          <Globe className="size-3.5 shrink-0" />
          {[location.city?.name, location.state?.name].filter(Boolean).join(", ")}
          {location.distanceKm != null && (
            <span className="text-pb-brand"> · {location.distanceKm.toFixed(1)} km away</span>
          )}
        </p>
      </div>
    </Link>
  );
}
