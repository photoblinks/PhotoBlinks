"use server";

// Server Actions behind the manual "Start AI Verification" button. Administrators only.
// A run exists only because an administrator clicked; it is driven one location per call by that
// administrator's open page (no cron, no schedule, no automatic trigger). All writes go through
// the admin-only SQL functions of 20261127000000_ai_verification_run_queue.sql, which only create
// PENDING proposals; nothing here can change a location.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkAdmin } from "@/lib/supabase/require-permission";
import { verifyLocation, type Ledger } from "@/lib/ai-verification/engine";
import { processNextLocation, type StepResult, type RpcResponse, type VerifyContext } from "@/lib/ai-verification/runner";
import { ELIGIBILITY_MIN_AGE_DAYS, loadRunProgress, type RunProgress } from "@/lib/ai-verification/progress";

export type RunActionResult<T = object> = ({ ok: true; progress: RunProgress } & T) | { error: string };

type Supabase = Awaited<ReturnType<typeof createClient>>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GENERIC_ERROR = "Something went wrong. Please refresh and try again.";

// Our own `raise exception` texts (P0001 / 55000) are written for admins and safe to show.
function userMessage(error: { code?: string; message: string }): string {
  if (error.code === "P0001" || error.code === "55000") return error.message;
  if (error.code === "42501") return "Only administrators can run AI verification.";
  console.error("[ai-run] unexpected error:", error.code, error.message);
  return GENERIC_ERROR;
}

async function guard(needKeys: boolean): Promise<{ supabase: Supabase } | { error: string }> {
  const supabase = await createClient();
  const auth = await checkAdmin(supabase);
  if (!auth.ok) return { error: auth.reason === "unauthenticated" ? "You must be signed in." : "Only administrators can run AI verification." };
  if (needKeys && (!process.env.BRAVE_API_KEY || !process.env.GEMINI_API_KEY)) {
    return { error: "BRAVE_API_KEY and GEMINI_API_KEY must be set on the server before verification can run." };
  }
  return { supabase };
}

async function withProgress<T extends object>(supabase: Supabase, extra: T): Promise<RunActionResult<T>> {
  return { ok: true, progress: await loadRunProgress(supabase), ...extra };
}

export async function getRunProgress(): Promise<RunActionResult> {
  const g = await guard(false);
  if ("error" in g) return g;
  return withProgress(g.supabase, {});
}

/** Click on "Start AI Verification": queue every eligible live location and take the lease. */
export async function startVerificationRun(): Promise<RunActionResult<{ runId: string; lease: string; total: number }>> {
  const g = await guard(true);
  if ("error" in g) return g;
  const { data, error } = await g.supabase.rpc("ai_start_run", { p_min_age_days: ELIGIBILITY_MIN_AGE_DAYS });
  if (error) return { error: userMessage(error) };
  const r = data as { run_id: string; lease_token: string; total: number };
  revalidatePath("/admin/ai-verification");
  return withProgress(g.supabase, { runId: r.run_id, lease: r.lease_token, total: r.total });
}

export async function resumeVerificationRun(runId: string): Promise<RunActionResult<{ runId: string; lease: string; pending: number }>> {
  if (!UUID_RE.test(runId)) return { error: "Invalid run." };
  const g = await guard(true);
  if ("error" in g) return g;
  const { data, error } = await g.supabase.rpc("ai_resume_run", { p_run_id: runId });
  if (error) return { error: userMessage(error) };
  const r = data as { run_id: string; lease_token: string; pending: number };
  return withProgress(g.supabase, { runId: r.run_id, lease: r.lease_token, pending: r.pending });
}

export async function retryFailedLocations(runId: string): Promise<RunActionResult<{ runId: string; lease: string; pending: number }>> {
  if (!UUID_RE.test(runId)) return { error: "Invalid run." };
  const g = await guard(true);
  if ("error" in g) return g;
  const { data, error } = await g.supabase.rpc("ai_retry_failed_locations", { p_run_id: runId });
  if (error) return { error: userMessage(error) };
  const r = data as { run_id: string; lease_token: string; pending: number };
  return withProgress(g.supabase, { runId: r.run_id, lease: r.lease_token, pending: r.pending });
}

export async function pauseVerificationRun(runId: string): Promise<RunActionResult> {
  if (!UUID_RE.test(runId)) return { error: "Invalid run." };
  const g = await guard(false);
  if ("error" in g) return g;
  const { error } = await g.supabase.rpc("ai_pause_run", { p_run_id: runId, p_reason: "Paused by an administrator" });
  if (error) return { error: userMessage(error) };
  revalidatePath("/admin/ai-verification");
  return withProgress(g.supabase, {});
}

export async function cancelVerificationRun(runId: string): Promise<RunActionResult> {
  if (!UUID_RE.test(runId)) return { error: "Invalid run." };
  const g = await guard(false);
  if ("error" in g) return g;
  const { error } = await g.supabase.rpc("ai_cancel_run", { p_run_id: runId });
  if (error) return { error: userMessage(error) };
  revalidatePath("/admin/ai-verification");
  return withProgress(g.supabase, {});
}

// The durable cost ledger for ONE claimed location. Reserve BEFORE a paid call (refused when the INR 2
// per-location cap or this session's ownership would be violated); confirm RIGHT AFTER it. Both run as
// the signed-in administrator through the admin-only SQL functions.
function makeLedger(supabase: Supabase, ctx: VerifyContext): Ledger {
  return {
    reserve: async (kind, amountInr) => {
      const { data, error } = await supabase.rpc("ai_reserve_cost", {
        p_run_id: ctx.runId, p_lease: ctx.lease, p_item_id: ctx.itemId, p_kind: kind, p_amount: amountInr,
      });
      if (error) throw new Error(error.message);
      return (data as { reservation_id: string }).reservation_id;
    },
    confirm: async (reservationId, actualInr, usage) => {
      const { error } = await supabase.rpc("ai_confirm_cost", {
        p_run_id: ctx.runId, p_lease: ctx.lease, p_reservation_id: reservationId, p_actual: actualInr,
        p_input_tokens: usage?.inputTokens ?? 0, p_output_tokens: usage?.outputTokens ?? 0,
      });
      if (error) throw new Error(error.message);
    },
  };
}

/** Processes exactly ONE location (one claim, one verification, one recorded result). */
export async function processNextVerificationLocation(runId: string, lease: string): Promise<RunActionResult<{ step: StepResult }>> {
  if (!UUID_RE.test(runId) || !UUID_RE.test(lease)) return { error: "Invalid run." };
  const g = await guard(true);
  if ("error" in g) return g;
  const { supabase } = g;

  const step = await processNextLocation(
    {
      rpc: async <T,>(fn: string, args: Record<string, unknown>): Promise<RpcResponse<T>> => {
        const { data, error } = await supabase.rpc(fn, args);
        return { data: (data ?? null) as T | null, error: error ? { message: userMessage(error), code: error.code } : null };
      },
      verify: (location, remainingInr, ctx) =>
        verifyLocation(location, remainingInr, {
          braveKey: process.env.BRAVE_API_KEY as string,
          geminiKey: process.env.GEMINI_API_KEY as string,
          ledger: makeLedger(supabase, ctx),
        }),
    },
    runId,
    lease,
  );

  if (step.kind !== "processed") revalidatePath("/admin/ai-verification"); // new proposals appear in the review list
  return withProgress(supabase, { step });
}
