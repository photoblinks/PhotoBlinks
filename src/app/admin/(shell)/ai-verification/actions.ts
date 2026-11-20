"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkModulePermission, PERMISSION } from "@/lib/supabase/require-permission";
import { recordActivityFor } from "@/lib/activity";

export type ReviewResult = { ok: true; message: string } | { error: string };

type Supabase = Awaited<ReturnType<typeof createClient>>;

const GENERIC_ERROR = "Something went wrong. Please refresh and try again.";
const MAX_BULK = 500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Our own RPC `raise exception` texts (SQLSTATE P0001) are written for admins and
// safe to show. Everything else (constraint, permission, connection errors) is
// mapped to a fixed message; the raw error is only logged server-side.
function userMessage(error: { code?: string; message: string }): string {
  if (error.code === "P0001") return error.message;
  if (error.code === "42501") return "You do not have permission to review AI verification fields.";
  if (error.code === "23514") return "The proposed value is not valid for this field.";
  console.error("[ai-verification] unexpected error:", error.code, error.message);
  return GENERIC_ERROR;
}

async function requirePublish(supabase: Supabase, verb: string): Promise<string | null> {
  const auth = await checkModulePermission(supabase, PERMISSION.LOCATIONS_PUBLISH);
  if (auth.ok) return null;
  return auth.reason === "forbidden"
    ? `You do not have permission to ${verb} AI verification fields.`
    : `You must be signed in to ${verb} fields.`;
}

// Validation, stale check, live-location check and the single-column location
// update run atomically in the DB (ai_approve_field_proposal) under the caller's
// locations.publish permission.
async function approveOne(supabase: Supabase, detailId: string, locationId: string): Promise<string | null> {
  const { data: approved, error } = await supabase.rpc("ai_approve_field_proposal", {
    p_detail_id: detailId,
    p_location_id: locationId,
  });
  if (error) return userMessage(error);
  if (!approved) return GENERIC_ERROR;
  const result = approved as {
    field: string;
    previous_value: string | null;
    approved_value: string;
    verification_history_id: string;
    confidence: number | null;
  };
  await recordActivityFor(supabase, {
    module: "locations",
    action: "ai_approved",
    entity_id: locationId,
    metadata: {
      field: result.field,
      previous_value: result.previous_value,
      approved_value: result.approved_value,
      verification_history_id: result.verification_history_id,
      confidence: result.confidence,
    },
  });
  return null;
}

function revalidate() {
  revalidatePath("/admin/ai-verification");
  revalidatePath("/admin/locations");
}

export async function approveField(detailId: string, locationId: string): Promise<ReviewResult> {
  const supabase = await createClient();
  const denied = await requirePublish(supabase, "approve");
  if (denied) return { error: denied };

  const error = await approveOne(supabase, detailId, locationId);
  if (error) return { error };
  revalidate();
  return { ok: true, message: "Approved. Location updated." };
}

// Approves many proposals (one location or many). The location of each proposal
// is read from the DB, never taken from the client; every proposal still goes
// through the same per-field checks as a single approval.
export async function approveMany(detailIds: string[]): Promise<ReviewResult> {
  if (
    !Array.isArray(detailIds) ||
    detailIds.length === 0 ||
    detailIds.length > MAX_BULK ||
    !detailIds.every((id) => typeof id === "string" && UUID_RE.test(id))
  ) {
    return { error: "Nothing selected." };
  }

  const supabase = await createClient();
  const denied = await requirePublish(supabase, "approve");
  if (denied) return { error: denied };

  const { data: rows, error: fetchError } = await supabase
    .from("ai_field_verification_details")
    .select("id, ai_location_verification_history!inner ( location_id, locations!inner ( is_published ) )")
    .in("id", detailIds)
    .eq("review_status", "pending")
    .eq("verification_status", "verified")
    .eq("ai_location_verification_history.locations.is_published", true);
  if (fetchError) return { error: userMessage(fetchError) };

  let approved = 0;
  const problems = new Set<string>();
  for (const row of rows ?? []) {
    const history = row.ai_location_verification_history as unknown as { location_id: string };
    const error = await approveOne(supabase, row.id, history.location_id);
    if (error) problems.add(error);
    else approved++;
  }
  const skipped = detailIds.length - approved;

  if (approved > 0) revalidate();
  if (approved === 0) {
    return { error: problems.size ? [...problems].slice(0, 3).join(" ") : "Nothing was approved: no selected change is awaiting approval." };
  }
  return {
    ok: true,
    message:
      skipped === 0
        ? `Approved ${approved} change${approved === 1 ? "" : "s"}.`
        : `Approved ${approved}, skipped ${skipped}${problems.size ? `: ${[...problems].slice(0, 2).join(" ")}` : "."}`,
  };
}

export async function rejectField(detailId: string, locationId: string): Promise<ReviewResult> {
  const supabase = await createClient();
  const denied = await requirePublish(supabase, "reject");
  if (denied) return { error: denied };

  const { data: fieldDetail, error: fetchError } = await supabase
    .from("ai_field_verification_details")
    .select(`
      *,
      ai_location_verification_history!inner (
        id,
        location_id,
        locations!inner (id, is_published)
      )
    `)
    .eq("id", detailId)
    .eq("ai_location_verification_history.locations.is_published", true)
    .single();

  if (fetchError || !fieldDetail) return { error: "Field proposal not found." };
  if (fieldDetail.ai_location_verification_history.locations.id !== locationId) {
    return { error: "Location mismatch." };
  }
  if (fieldDetail.review_status !== "pending") {
    return { error: `Field already ${fieldDetail.review_status}.` };
  }

  const { error: reviewError } = await supabase
    .from("ai_field_verification_details")
    .update({
      review_status: "rejected",
      reviewed_by: (await supabase.auth.getUser()).data.user?.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", detailId);
  if (reviewError) return { error: userMessage(reviewError) };

  await recordActivityFor(supabase, {
    module: "locations",
    action: "ai_rejected",
    entity_id: locationId,
    metadata: {
      field: fieldDetail.field_name,
      proposed_value: fieldDetail.proposed_value,
      verification_history_id: fieldDetail.verification_history_id,
      confidence: fieldDetail.confidence,
      reason: "Admin rejected AI proposal",
    },
  });

  revalidatePath("/admin/ai-verification");
  return { ok: true, message: "Rejected." };
}
