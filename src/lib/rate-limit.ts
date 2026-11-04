import { createHash } from "node:crypto";
import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Hashed client IP from the platform-set forwarding header (Vercel overwrites
 * x-forwarded-for, so the first entry is the real client). Null when absent
 * (e.g. local dev), in which case IP limits are skipped. */
async function clientIpKey(): Promise<string | null> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip");
  return ip ? createHash("sha256").update(ip).digest("hex").slice(0, 32) : null;
}

/** Counts a hit against `key` in the DB-backed limiter (check_rate_limit).
 * Returns false when the caller is over the limit. Fails open if the limiter
 * itself errors, so an outage never blocks every signup. */
export async function allowAction(
  supabase: SupabaseClient,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("check_rate_limit failed", { code: error.code });
    return true;
  }
  return data === true;
}

export const SIGNUP_RATE_LIMITED_MESSAGE = "Too many signup attempts. Please try again later.";

/** Per-IP signup throttle shared by every signup path: 10/hour and 30/day. */
export async function allowSignup(supabase: SupabaseClient): Promise<boolean> {
  const ip = await clientIpKey();
  if (!ip) return true;
  return (
    (await allowAction(supabase, `signup:h:${ip}`, 10, 3600)) &&
    (await allowAction(supabase, `signup:d:${ip}`, 30, 86400))
  );
}
