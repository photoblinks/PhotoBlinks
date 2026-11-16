"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { allowByIp } from "@/lib/rate-limit";
import { buildWhatsAppLink } from "@/lib/format";
import { getSharedLocationCollection } from "@/lib/public-data";

// Photographer phone/WhatsApp numbers never ship in page HTML or RSC payloads
// (scrapers and AI crawlers read those). They are returned here only after an
// explicit click, per-IP rate limited.

const targetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("profile"), slug: z.string().min(1).max(200) }),
  z.object({ kind: z.literal("sponsored"), id: z.string().uuid() }),
  z.object({ kind: z.literal("photo"), id: z.string().uuid(), locationId: z.string().uuid() }),
  z.object({ kind: z.literal("collection"), token: z.string().min(1).max(100) }),
]);
const channelSchema = z.enum(["call", "whatsapp"]);

export type ContactTarget = z.infer<typeof targetSchema>;
export type ContactChannel = z.infer<typeof channelSchema>;
export type RevealResult = { url: string } | { error: "rate_limited" | "not_found" };

type Numbers = { phone: string | null; whatsapp: string | null };

async function resolveNumbers(target: ContactTarget): Promise<Numbers | null> {
  const db = createPublicClient();

  switch (target.kind) {
    case "profile": {
      const { data } = await db.rpc("get_public_photographers", { p_slug: target.slug });
      const row = (data as { phone_number: string | null; whatsapp_number: string | null }[] | null)?.[0];
      return row ? { phone: row.phone_number, whatsapp: row.whatsapp_number } : null;
    }
    case "sponsored": {
      // Service role bypasses RLS, so the "still active" rule is applied here.
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await db
        .from("sponsored_photographers")
        .select("phone_number, whatsapp_number")
        .eq("id", target.id)
        .gte("expiry_date", today)
        .maybeSingle();
      return data ? { phone: data.phone_number, whatsapp: data.whatsapp_number } : null;
    }
    case "photo": {
      // Same visibility rules as the public page: approved + published location.
      const { data } = await db.rpc("get_approved_photographer_photos", { p_location_id: target.locationId });
      const photo = (data as { id: string; phone_number: string }[] | null)?.find((p) => p.id === target.id);
      return photo ? { phone: photo.phone_number, whatsapp: photo.phone_number } : null;
    }
    case "collection": {
      const collection = await getSharedLocationCollection(target.token);
      return collection
        ? { phone: collection.phoneNumber, whatsapp: collection.whatsappNumber || collection.phoneNumber }
        : null;
    }
  }
}

export async function revealPhotographerContact(targetInput: ContactTarget, channelInput: ContactChannel): Promise<RevealResult> {
  const target = targetSchema.safeParse(targetInput);
  const channel = channelSchema.safeParse(channelInput);
  if (!target.success || !channel.success) return { error: "not_found" };

  const supabase = await createClient();
  if (!(await allowByIp(supabase, "contact:h", 20, 3600)) || !(await allowByIp(supabase, "contact:d", 60, 86400))) {
    return { error: "rate_limited" };
  }

  const numbers = await resolveNumbers(target.data);
  if (!numbers) return { error: "not_found" };

  if (channel.data === "call") {
    return numbers.phone ? { url: `tel:${numbers.phone.replace(/[^\d+]/g, "")}` } : { error: "not_found" };
  }
  return numbers.whatsapp ? { url: buildWhatsAppLink(numbers.whatsapp) } : { error: "not_found" };
}
