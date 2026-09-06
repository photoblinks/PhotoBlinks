"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { Phone, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildWhatsAppLink } from "@/lib/format";
import { recordSponsoredPhotographerEvent } from "@/lib/sponsored-photographer-analytics";
import type { PublicSponsoredPhotographer } from "@/lib/public-data";

/** Paid placement, shown under the Pricing card on a location's state — see
 * getActiveSponsoredPhotographerByState. The green dot + "Sponsored" label
 * is required labeling so this never reads as an editorial recommendation,
 * venue verification, or PhotoBlinks-owned service.
 *
 * Client component (not just for the Call/WhatsApp click handlers): an
 * impression must be counted once per actual browser page view, but this
 * card renders on an ISR-cached location page (src/app/(public)/location/
 * [slug]/page.tsx, revalidate=60) — a server-side "record on render" would
 * fire once per cache regeneration, not once per visitor, undercounting
 * massively. Tracking client-side after mount is what actually matches
 * "the card was displayed" for every visitor, cached or not. */
export function SponsoredPhotographerCard({
  photographer,
  photographerId,
  locationId,
  pagePath,
}: {
  photographer: PublicSponsoredPhotographer;
  photographerId: string;
  locationId: string;
  pagePath: string;
}) {
  const trackedImpression = useRef(false);

  useEffect(() => {
    if (trackedImpression.current) return;
    trackedImpression.current = true;
    void recordSponsoredPhotographerEvent(photographerId, "impression", locationId, pagePath);
    // photographerId/locationId/pagePath are stable for the lifetime of a
    // given card instance — only fire once per mount, not on every change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function trackClick(eventType: "call_click" | "whatsapp_click") {
    void recordSponsoredPhotographerEvent(photographerId, eventType, locationId, pagePath);
  }

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-500" />
          Sponsored
        </div>
        <span className="truncate text-xs font-medium text-muted-foreground">
          {photographer.photography_name}
        </span>
      </div>

      <div className="relative mb-3 aspect-video w-full overflow-hidden rounded-lg">
        <Image
          src={photographer.image_url}
          alt={photographer.photography_name}
          fill
          className="object-cover"
        />
      </div>

      <div>
        <p className="text-sm font-medium">{photographer.title}</p>
        {photographer.description && (
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{photographer.description}</p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button
          render={<a href={`tel:${photographer.phone_number}`} />}
          variant="outline"
          className="w-full border border-pb-brand bg-white text-pb-brand hover:bg-pb-brand/5"
          onClick={() => trackClick("call_click")}
        >
          <Phone className="size-4" />
          Call
        </Button>
        <Button
          render={
            <a
              href={buildWhatsAppLink(photographer.whatsapp_number)}
              target="_blank"
              rel="noopener noreferrer"
            />
          }
          variant="outline"
          className="w-full border border-pb-brand bg-white text-pb-brand hover:bg-pb-brand/5"
          onClick={() => trackClick("whatsapp_click")}
        >
          <MessageCircle className="size-4" />
          WhatsApp
        </Button>
      </div>
    </div>
  );
}
