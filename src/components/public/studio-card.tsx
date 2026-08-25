import Link from "next/link";
import Image from "next/image";
import { Globe, ArrowRight } from "lucide-react";
import type { PublicStudioCard } from "@/lib/public-data";

export function StudioCard({ studio }: { studio: PublicStudioCard }) {
  return (
    <Link href={`/studio/${studio.slug}`} className="group flex flex-col gap-3">
      <div className="relative aspect-4/3 overflow-hidden rounded-2xl bg-muted">
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
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-20 bg-linear-to-t from-black/50 to-transparent"
        />
        {studio.fromPrice != null && (
          <span className="absolute top-3 left-3 rounded-full bg-black/60 px-3.5 py-1.5 text-sm font-[250] text-white backdrop-blur-sm">
            From ₹{studio.fromPrice.toLocaleString("en-IN")}
          </span>
        )}
        <span className="absolute right-3 bottom-3 flex items-center gap-1 text-sm font-[250] text-white">
          View Studio
          <ArrowRight className="size-4" strokeWidth={2} />
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="font-sans text-lg font-[450] text-foreground">{studio.name}</h3>
        <p className="flex items-center gap-1.5 text-sm font-[220] text-muted-foreground">
          <Globe className="size-3.5 shrink-0" />
          {[studio.city?.name, studio.state?.name].filter(Boolean).join(", ")}
        </p>
      </div>
    </Link>
  );
}
