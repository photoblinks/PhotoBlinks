import { createClient } from "@/lib/supabase/server";
import { requireModulePage, PERMISSION } from "@/lib/supabase/require-permission";
import { loadRunProgress } from "@/lib/ai-verification/progress";
import { ReviewList, type ReviewGroup } from "./review-list";
import { VerificationRunControl } from "./run-control";

const MAX_ROWS = 1000;

// Server Actions used on this page (one location per call) may run up to this long.
export const maxDuration = 60;

type LocationEmbed = { name: string; slug: string } & Record<string, string | boolean | null>;
type Row = {
  id: string;
  field_name: string;
  current_value: string | null;
  proposed_value: string;
  confidence: number | null;
  grounded_evidence: string | null;
  source_urls: string[];
  ai_location_verification_history: { location_id: string; locations: LocationEmbed };
};

export default async function AIVerificationPage() {
  const staff = await requireModulePage([PERMISSION.LOCATIONS_PUBLISH]);

  const supabase = await createClient();
  const progress = await loadRunProgress(supabase);

  // Only what a reviewer can act on: verified + pending proposals from the latest
  // check of LIVE (published) locations. Unverified, already-reviewed and
  // superseded proposals are not listed.
  const { data } = await supabase
    .from("ai_field_verification_details")
    .select(`
      id, field_name, current_value, proposed_value, confidence, grounded_evidence, source_urls,
      ai_location_verification_history!inner (
        location_id,
        locations!inner (
          name, slug, is_published,
          pre_wedding_shoot, prior_booking, drone_status, drone_permission, entry_fee, shoot_permit_fee
        )
      )
    `)
    .eq("review_status", "pending")
    .eq("verification_status", "verified")
    .eq("ai_location_verification_history.is_latest", true)
    .eq("ai_location_verification_history.locations.is_published", true)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  const groups = new Map<string, ReviewGroup>();
  for (const row of (data ?? []) as unknown as Row[]) {
    const { location_id, locations: loc } = row.ai_location_verification_history;
    const actual = (loc[row.field_name] as string | null) ?? null;
    // The live value changed since the AI check: it can no longer be approved.
    if (actual !== (row.current_value ?? null)) continue;
    // Nothing to change: the live value already equals the proposal.
    if (actual === row.proposed_value) continue;

    let group = groups.get(location_id);
    if (!group) {
      group = { locationId: location_id, name: loc.name, slug: loc.slug, fields: [] };
      groups.set(location_id, group);
    }
    group.fields.push({
      id: row.id,
      fieldName: row.field_name,
      currentValue: actual,
      proposedValue: row.proposed_value,
      confidence: row.confidence,
      evidence: row.grounded_evidence,
      sourceUrls: row.source_urls ?? [],
    });
  }

  const list = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">AI Location Verification</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live locations with AI-checked changes waiting for your approval.
        </p>
      </div>
      <VerificationRunControl
        initial={progress}
        canRun={staff.isAdmin}
        keysConfigured={Boolean(process.env.BRAVE_API_KEY && process.env.GEMINI_API_KEY)}
      />
      <ReviewList groups={list} />
    </div>
  );
}
