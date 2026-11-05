import Link from "next/link";
import Image from "next/image";
import { Camera, MapPin, Phone, Wallet } from "lucide-react";
import { WhatsAppIcon } from "@/components/public/whatsapp-icon";
import { Button } from "@/components/ui/button";
import { VerifiedBadge } from "@/components/public/verified-badge";
import { buildWhatsAppLink } from "@/lib/format";
import type { PublicPhotographer } from "@/lib/public-data";

const inr = (amount: number) => `₹${amount.toLocaleString("en-IN")}`;

export function PhotographerCard({ photographer }: { photographer: PublicPhotographer }) {
  const {
    slug,
    studioName,
    displayName,
    avatarUrl,
    logoUrl,
    bannerUrl,
    city,
    state,
    startingPrice,
    startingActualPrice,
    offersPreWedding,
    offersWedding,
    isVerified,
    phoneNumber,
    whatsappNumber,
  } = photographer;

  const banner = bannerUrl ?? avatarUrl;
  const logo = logoUrl ?? avatarUrl;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <div className="relative aspect-16/9 overflow-hidden bg-linear-to-br from-emerald-950 via-pb-brand to-emerald-800">
        {banner ? (
          <Image
            src={banner}
            alt=""
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Camera className="size-10 text-white/60" strokeWidth={1.25} />
          </div>
        )}
        <div aria-hidden="true" className="absolute inset-0 bg-linear-to-t from-black/30 to-transparent" />
      </div>

      <div className="flex flex-1 flex-col gap-3 px-4 pb-4">
        <div className="relative -mt-8 size-16 shrink-0 overflow-hidden rounded-full border-4 border-white bg-white shadow-md ring-1 ring-black/5">
          {logo ? (
            <Image src={logo} alt={`${studioName} logo`} fill sizes="64px" className="object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center bg-pb-brand/10">
              <Camera className="size-6 text-pb-brand" strokeWidth={1.5} />
            </div>
          )}
        </div>

        <div>
          <h3 className="font-heading flex items-center gap-1.5 text-lg leading-snug font-semibold text-foreground">
            {/* Stretched link: the whole card opens the profile, while the
                Call / WhatsApp buttons below sit above it (z-10). */}
            <Link href={`/photographers/p/${slug}`} className="after:absolute after:inset-0">
              {studioName}
            </Link>
            {isVerified && <VerifiedBadge />}
          </h3>
          <p className="text-sm text-muted-foreground">{displayName}</p>
        </div>

        {(offersPreWedding || offersWedding) && (
          <div className="flex flex-wrap gap-1.5">
            {offersPreWedding && (
              <span className="rounded-full bg-pb-brand/10 px-2.5 py-0.5 text-xs font-medium text-pb-brand">
                Pre-wedding
              </span>
            )}
            {offersWedding && (
              <span className="rounded-full bg-pb-brand/10 px-2.5 py-0.5 text-xs font-medium text-pb-brand">
                Wedding
              </span>
            )}
          </div>
        )}

        <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          <p className="flex items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0 text-pb-brand" />
            {city}, {state.name}
          </p>
          {startingPrice != null && (
            <p className="flex items-center gap-1.5 font-medium text-foreground">
              <Wallet className="size-3.5 shrink-0 text-pb-brand" />
              From {inr(startingPrice)}
              {startingActualPrice != null && startingActualPrice > startingPrice && (
                <span className="font-normal text-muted-foreground line-through">{inr(startingActualPrice)}</span>
              )}
            </p>
          )}
        </div>

        {(phoneNumber || whatsappNumber) && (
          <div className="relative z-10 mt-auto grid grid-cols-2 gap-2 pt-1">
            {phoneNumber && (
              <Button size="sm" render={<a href={`tel:${phoneNumber.replace(/[^\d+]/g, "")}`} />}>
                <Phone className="size-4" /> Call
              </Button>
            )}
            {whatsappNumber && (
              <Button
                size="sm"
                className="bg-[#25D366] text-white hover:bg-[#1fb857]"
                render={<a href={buildWhatsAppLink(whatsappNumber)} target="_blank" rel="noopener noreferrer" />}
              >
                <WhatsAppIcon className="size-4" /> WhatsApp
              </Button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
