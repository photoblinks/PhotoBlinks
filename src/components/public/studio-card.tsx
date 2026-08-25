import Link from "next/link";
import Image from "next/image";
import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PublicStudioCard } from "@/lib/public-data";

export function StudioCard({ studio }: { studio: PublicStudioCard }) {
  return (
    <Link href={`/studio/${studio.slug}`} className="group flex flex-col gap-2.5">
      <div className="relative aspect-4/3 overflow-hidden rounded-xl bg-muted">
        {studio.primaryImageUrl ? (
          <Image
            src={studio.primaryImageUrl}
            alt={studio.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No image
          </div>
        )}
        {studio.fromPrice != null && (
          <Badge className="absolute top-2.5 left-2.5 shadow-sm" variant="secondary">
            From ₹{studio.fromPrice.toLocaleString("en-IN")}
          </Badge>
        )}
        <span className="absolute right-2.5 bottom-2.5 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-foreground shadow-sm backdrop-blur">
          View Studio →
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        <h3 className="font-heading text-base font-semibold">{studio.name}</h3>
        <p className="flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" />
          {[studio.city?.name, studio.state?.name].filter(Boolean).join(", ")}
        </p>
      </div>
    </Link>
  );
}
