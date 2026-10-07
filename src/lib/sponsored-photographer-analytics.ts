"use server";

import { createPublicClient } from "@/lib/supabase/public";

// Public-facing tracking action for Phase 19A's sponsored-photographer
// analytics (see supabase/migrations/20260905000000_sponsored_photographer_events.sql).
// Uses the same cookie-free public client as the rest of this app's
// server-side data reads (src/lib/public-data.ts). Phase 1
// (20261007000000_close_anon_bulk_exposure.sql) revoked the anon role's
// INSERT grant on sponsored_photographer_events, so this action runs through
// the service-role client (createPublicClient is server-only and never
// reaches the browser). This union type is a second, cheap layer that stops
// the client from sending anything other than one of the three defined event
// types; the RLS policy that previously gated the insert was removed along
// with the anon insert path.
export type SponsoredPhotographerEventType = "impression" | "call_click" | "whatsapp_click";

const VALID_EVENT_TYPES: SponsoredPhotographerEventType[] = [
  "impression",
  "call_click",
  "whatsapp_click",
];

/** Records one impression/call/WhatsApp-click event for a sponsored
 * photographer. Fire-and-forget by design: the caller must not await this
 * in a way that blocks the user's own action (a tel:/wa.me navigation, or
 * the page itself rendering) — see SponsoredPhotographerCard. Swallows its
 * own errors; a failed insert here must never surface to the visitor. */
export async function recordSponsoredPhotographerEvent(
  photographerId: string,
  eventType: SponsoredPhotographerEventType,
  locationId: string | null,
  pagePath: string,
): Promise<void> {
  if (!VALID_EVENT_TYPES.includes(eventType)) return;

  try {
    const supabase = createPublicClient();
    await supabase.from("sponsored_photographer_events").insert({
      photographer_id: photographerId,
      event_type: eventType,
      location_id: locationId,
      page_path: pagePath,
    });
  } catch {
    // Analytics must never break the public experience.
  }
}
