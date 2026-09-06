"use server";

import { createPublicClient } from "@/lib/supabase/public";

// Public-facing tracking action for Phase 19A's sponsored-photographer
// analytics (see supabase/migrations/20260905000000_sponsored_photographer_events.sql).
// Uses the same cookie-free public client as every other anonymous read in
// this app (src/lib/public-data.ts) — no session, no service-role key.
// RLS's sponsored_photographer_events_insert_public policy is the actual
// gate (requires a real photographer/location id); this union type is a
// second, cheap layer that stops the client from sending anything other
// than one of the three defined event types.
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
