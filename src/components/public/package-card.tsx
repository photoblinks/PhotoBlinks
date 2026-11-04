import Image from "next/image";
import {
  Camera,
  Check,
  Clock,
  Film,
  Hourglass,
  Images,
  Plane,
  BedDouble,
  Video,
} from "lucide-react";
import type { PhotographerPackage } from "@/lib/photographer-options";

const rupees = (value: number) => `₹${value.toLocaleString("en-IN")}`;

/** Customer-facing package card. Shows only what the photographer filled in:
 * empty counts, unselected services and unset charges are omitted entirely. */
export function PackageCard({ pkg }: { pkg: PhotographerPackage }) {
  const hasOffer = pkg.offerPrice != null && pkg.offerPrice < pkg.actualPrice;
  const discount = hasOffer ? Math.round(((pkg.actualPrice - pkg.offerPrice!) / pkg.actualPrice) * 100) : 0;

  const deliverables = [
    pkg.editedPicturesCount != null && { icon: Images, value: pkg.editedPicturesCount, label: "Edited pictures" },
    pkg.editedVideosCount != null && { icon: Video, value: pkg.editedVideosCount, label: "Edited videos" },
    pkg.saveTheDateVideoCount != null && { icon: Film, value: pkg.saveTheDateVideoCount, label: "Save The Date video" },
    pkg.countdownImagesCount != null && { icon: Hourglass, value: pkg.countdownImagesCount, label: "Countdown images" },
  ].filter((d): d is { icon: typeof Images; value: number; label: string } => Boolean(d));

  const duration =
    pkg.shootDurationUnit && pkg.shootDurationValue ? `${pkg.shootDurationValue} ${pkg.shootDurationUnit === "days" ? "Day(s)" : "Hour(s)"}` : null;

  const charges = [
    pkg.travelCharges && { icon: Plane, label: "Travel", value: pkg.travelCharges },
    pkg.stayCharges && { icon: BedDouble, label: "Stay", value: pkg.stayCharges },
  ].filter((c): c is { icon: typeof Plane; label: string; value: "extra" | "included" } => Boolean(c));

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-3xl border bg-white shadow-sm transition-shadow hover:shadow-lg">
      <div className="relative aspect-16/10 overflow-hidden bg-linear-to-br from-emerald-950 via-pb-brand to-emerald-800">
        {pkg.bannerImageUrl ? (
          <Image
            src={pkg.bannerImageUrl}
            alt={pkg.name}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Camera className="size-10 text-white/60" strokeWidth={1.25} />
          </div>
        )}
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-black/60 to-transparent" />
        {hasOffer && (
          <span className="absolute top-3 right-3 rounded-full bg-amber-400 px-2.5 py-1 text-xs font-semibold text-amber-950 shadow">
            {discount}% OFF
          </span>
        )}
        <h3 className="font-heading absolute inset-x-4 bottom-3 text-xl leading-snug font-semibold text-white">{pkg.name}</h3>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-baseline gap-2">
          <span className="font-heading text-2xl font-semibold text-pb-brand">
            {rupees(hasOffer ? pkg.offerPrice! : pkg.actualPrice)}
          </span>
          {hasOffer && <span className="text-sm text-muted-foreground line-through">{rupees(pkg.actualPrice)}</span>}
        </div>

        {pkg.services.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Included services</p>
            <ul className="flex flex-col gap-1.5">
              {pkg.services.map((service) => (
                <li key={service} className="flex items-center gap-2 text-sm">
                  <Check className="size-4 shrink-0 text-pb-brand" strokeWidth={2.5} />
                  {service}
                </li>
              ))}
            </ul>
          </div>
        )}

        {deliverables.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Deliverables</p>
            <ul className="grid grid-cols-2 gap-2">
              {deliverables.map(({ icon: Icon, value, label }) => (
                <li key={label} className="flex items-center gap-2 rounded-xl bg-pb-brand/5 px-3 py-2">
                  <Icon className="size-4 shrink-0 text-pb-brand" />
                  <span className="text-sm leading-tight">
                    <span className="font-semibold">{value}</span> {label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(duration || charges.length > 0) && (
          <div className="mt-auto flex flex-wrap gap-2 border-t pt-4">
            {duration && (
              <span className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium">
                <Clock className="size-3.5 text-pb-brand" />
                {duration}
              </span>
            )}
            {charges.map(({ icon: Icon, label, value }) => (
              <span key={label} className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium">
                <Icon className="size-3.5 text-pb-brand" />
                {label}: {value === "included" ? "Included" : "Extra"}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
