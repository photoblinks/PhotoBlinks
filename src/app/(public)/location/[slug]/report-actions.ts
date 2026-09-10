"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const REPORT_TYPES = [
  "incorrect_information",
  "location_closed",
  "wrong_location",
  "inappropriate_content",
  "duplicate",
  "other",
] as const;

// Authenticated reporters: reports in any rolling 24h window, across all
// locations. Kept low — this is a moderation intake, not a discussion forum.
const AUTH_DAILY_LIMIT = 5;

// Anonymous reporters have no trustworthy identifier in this architecture —
// no session, and there is no existing IP/fingerprint capture anywhere in
// the codebase to reuse (a client-supplied header would be trivially
// spoofable and is deliberately not treated as one). In its absence, this
// falls back to a coarse per-location guard: cap total anonymous reports
// on a single location within 24h, which bounds a spam burst against any
// one location without pretending to identify individual anonymous users.
const ANON_PER_LOCATION_DAILY_LIMIT = 10;

const reportSchema = z.object({
  report_type: z.enum(REPORT_TYPES),
  message: z.string().trim().min(1, "Please describe the issue.").max(1000, "Message must be 1000 characters or fewer."),
});

type SubmitResult =
  | { ok: true }
  | { error: "invalid_type" | "too_long" | "empty_message" | "location_not_found" | "rate_limited" | "failed" };

/** Submits a location report as the current session (signed-in user or
 * anonymous). reporter_user_id is always derived server-side from
 * auth.uid() — never taken from the client — and status, reviewed_by,
 * reviewed_at, admin_note are all omitted so the column defaults (and the
 * RLS WITH CHECK, which pins them to NULL/'pending' a second time) are
 * what actually land. Approving/rejecting the resulting row never touches
 * the locations table — this is intake only. */
export async function reportLocation(locationId: string, formData: FormData): Promise<SubmitResult> {
  const parsed = reportSchema.safeParse({
    report_type: formData.get("report_type"),
    message: formData.get("message"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue.path[0] === "report_type") return { error: "invalid_type" };
    return { error: issue.code === "too_big" ? "too_long" : "empty_message" };
  }
  const { report_type, message } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Server-side location validation: must exist and be published. The
  // browser only ever supplies the location's own id from the page it's
  // already on — this confirms that id still names a real, live location
  // rather than trusting it outright (also re-enforced by the RLS WITH
  // CHECK's own EXISTS clause as a second, independent layer).
  const { data: location } = await supabase
    .from("locations")
    .select("id")
    .eq("id", locationId)
    .eq("is_published", true)
    .maybeSingle();
  if (!location) return { error: "location_not_found" };

  if (user) {
    const { count } = await supabase
      .from("location_reports")
      .select("id", { count: "exact", head: true })
      .eq("reporter_user_id", user.id)
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    if ((count ?? 0) >= AUTH_DAILY_LIMIT) return { error: "rate_limited" };
  } else {
    const { count } = await supabase
      .from("location_reports")
      .select("id", { count: "exact", head: true })
      .is("reporter_user_id", null)
      .eq("location_id", locationId)
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    if ((count ?? 0) >= ANON_PER_LOCATION_DAILY_LIMIT) return { error: "rate_limited" };
  }

  // Duplicate-submit guard (double-click, not real abuse protection): skip
  // re-inserting an identical report on this location in the last minute.
  // For anonymous reporters this can't be scoped to "this same visitor" —
  // it's scoped to the location + content instead, which is a strictly
  // narrower (and therefore safe) match than the rate limit above.
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  let duplicateQuery = supabase
    .from("location_reports")
    .select("id")
    .eq("location_id", locationId)
    .eq("report_type", report_type)
    .eq("message", message)
    .gte("created_at", oneMinuteAgo);
  duplicateQuery = user ? duplicateQuery.eq("reporter_user_id", user.id) : duplicateQuery.is("reporter_user_id", null);
  const { data: recentDuplicate } = await duplicateQuery.maybeSingle();
  if (recentDuplicate) return { ok: true };

  const { error } = await supabase.from("location_reports").insert({
    location_id: locationId,
    reporter_user_id: user?.id ?? null,
    report_type,
    message,
  });

  if (error) return { error: "failed" };
  return { ok: true };
}
