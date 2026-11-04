import Link from "next/link";
import Image from "next/image";
import { Camera, MapPin } from "lucide-react";
import type { PublicPhotographer } from "@/lib/public-data";

export function PhotographerCard({ photographer }: { photographer: PublicPhotographer }) {
  const { slug, studioName, displayName, avatarUrl, city, state, services, startingPrice, experienceYears } =
    photographer;

  return (
    <Link
      href={`/photographers/p/${slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="relative aspect-4/3 overflow-hidden bg-linear-to-br from-emerald-950 via-pb-brand to-emerald-800">
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={`${displayName} — ${studioName}`}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Camera className="size-10 text-white/60" strokeWidth={1.25} />
          </div>
        )}
        {startingPrice != null && (
          <span className="absolute top-3 left-3 rounded-full bg-black/55 px-2.5 py-1 text-xs text-white ring-1 ring-white/20 backdrop-blur-sm">
            From ₹{startingPrice.toLocaleString("en-IN")}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div>
          <h3 className="font-heading text-lg leading-snug font-semibold text-foreground">{studioName}</h3>
          <p className="text-sm text-muted-foreground">{displayName}</p>
        </div>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="size-3.5 shrink-0 text-pb-brand" />
          {city}, {state.name}
        </p>
        {(services.length > 0 || experienceYears != null) && (
          <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
            {experienceYears != null && (
              <span className="rounded-full bg-pb-brand/10 px-2.5 py-0.5 text-xs font-medium text-pb-brand">
                {experienceYears} yr{experienceYears === 1 ? "" : "s"} experience
              </span>
            )}
            {services.slice(0, 2).map((service) => (
              <span key={service} className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                {service}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
