import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import type { PublicStudioCard } from "@/lib/public-data";

export function StudioCard({ studio }: { studio: PublicStudioCard }) {
  return (
    <Link
      href={`/studio/${studio.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-4/3 bg-muted">
        {studio.primaryImageUrl ? (
          <Image
            src={studio.primaryImageUrl}
            alt={studio.name}
            fill
            className="object-cover transition-transform group-hover:scale-105"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No image
          </div>
        )}
        {studio.fromPrice != null && (
          <Badge className="absolute top-2 right-2" variant="secondary">
            From ₹{studio.fromPrice.toLocaleString("en-IN")}
          </Badge>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="font-medium">{studio.name}</h3>
        <p className="text-sm text-muted-foreground">
          {[studio.city?.name, studio.state?.name].filter(Boolean).join(", ")}
        </p>
        <span className="mt-auto pt-2 text-sm font-medium text-primary group-hover:underline">
          View Studio →
        </span>
      </div>
    </Link>
  );
}
