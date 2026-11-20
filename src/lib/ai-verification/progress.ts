// Read-only view of the current / latest manual verification run, for the admin page. All reads go
// through the request's RLS client (staff with location access only).
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** A live location is eligible when it has no completed check in the last N days. */
export const ELIGIBILITY_MIN_AGE_DAYS = 30;

export type RunItem = {
  id: string;
  name: string;
  status: "pending" | "running" | "done" | "failed" | "budget_exhausted" | "skipped";
  costInr: number;
  attempts: number;
  error: string | null;
};

export type RunProgress = {
  run: {
    id: string;
    status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
    pauseReason: string | null;
    totalLocations: number;
    processed: number;
    failed: number;
    totalCostInr: number;
    startedAt: string | null;
    finishedAt: string | null;
    lastError: string | null;
    /** Running, but its page stopped responding (lease expired): it can be resumed. */
    stalled: boolean;
  } | null;
  counts: { pending: number; running: number; done: number; failed: number; budgetExhausted: number; skipped: number };
  proposals: number;
  items: RunItem[];
  eligibleCount: number;
};

type RunRow = {
  id: string;
  status: NonNullable<RunProgress["run"]>["status"];
  pause_reason: string | null;
  total_locations: number;
  processed_locations: number;
  failed_locations: number;
  total_cost_inr: number | string;
  started_at: string | null;
  finished_at: string | null;
  last_error: string | null;
  lease_expires_at: string | null;
};

type ItemRow = {
  id: string;
  status: RunItem["status"];
  attempts: number;
  cost_inr: number | string;
  last_error: string | null;
  locations: { name: string } | { name: string }[] | null;
};

type CountsRow = Record<string, number | string> | null;

const EMPTY_COUNTS: RunProgress["counts"] = { pending: 0, running: 0, done: 0, failed: 0, budgetExhausted: 0, skipped: 0 };

export async function loadRunProgress(supabase: SupabaseServerClient): Promise<RunProgress> {
  const { data: eligible } = await supabase.rpc("ai_eligible_location_count", { p_min_age_days: ELIGIBILITY_MIN_AGE_DAYS });
  const eligibleCount = typeof eligible === "number" ? eligible : 0;

  const { data: runRow } = await supabase
    .from("ai_maintenance_runs")
    .select("id, status, pause_reason, total_locations, processed_locations, failed_locations, total_cost_inr, started_at, finished_at, last_error, lease_expires_at")
    .eq("source", "admin_button")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!runRow) return { run: null, counts: EMPTY_COUNTS, proposals: 0, items: [], eligibleCount };
  const r = runRow as unknown as RunRow;

  const [{ data: counts }, { data: items }] = await Promise.all([
    supabase.rpc("ai_run_progress", { p_run_id: r.id }),
    supabase
      .from("ai_run_locations")
      .select("id, status, attempts, cost_inr, last_error, locations(name)")
      .eq("run_id", r.id)
      .order("updated_at", { ascending: false })
      .limit(40),
  ]);
  const c = (counts ?? null) as CountsRow;
  const num = (k: string) => Number(c?.[k] ?? 0);

  return {
    run: {
      id: r.id,
      status: r.status,
      pauseReason: r.pause_reason,
      totalLocations: r.total_locations,
      processed: r.processed_locations,
      failed: r.failed_locations,
      totalCostInr: Number(r.total_cost_inr),
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      lastError: r.last_error,
      stalled: r.status === "running" && r.lease_expires_at != null && new Date(r.lease_expires_at).getTime() < Date.now(),
    },
    counts: {
      pending: num("pending"), running: num("running"), done: num("done"), failed: num("failed"),
      budgetExhausted: num("budget_exhausted"), skipped: num("skipped"),
    },
    proposals: num("proposals"),
    items: ((items ?? []) as unknown as ItemRow[]).map((i) => ({
      id: i.id,
      name: (Array.isArray(i.locations) ? i.locations[0]?.name : i.locations?.name) ?? "(unknown)",
      status: i.status,
      costInr: Number(i.cost_inr),
      attempts: i.attempts,
      error: i.last_error,
    })),
    eligibleCount,
  };
}
