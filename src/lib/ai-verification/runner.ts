// One step of a verification run: claim the next location, verify it, record the result.
// Pure orchestration over injected `rpc` and `verify`, so it is unit-tested without Supabase.
//
// Guarantees (the database enforces the same rules independently):
//   - results are stored as PENDING proposals; this module never writes to `locations`;
//   - a failure on one location never stops the run (it is retried once, then marked failed);
//   - an auth / quota error (401, 403, 429) pauses the whole run immediately;
//   - money is never reported by this module: every paid call is reserved and confirmed in the
//     database's cost ledger by the verifier (`ctx` carries the ownership the ledger checks), and
//     anything left unconfirmed is charged in full when the attempt is closed, so the per-location
//     cap holds across retries, timeouts and resumes.
import type { LocationToVerify, ResultPayload, VerifyOutcome } from "./engine";

export type RpcError = { message: string; code?: string };
export type RpcResponse<T> = { data: T | null; error: RpcError | null };

/** Ownership the cost ledger checks on every reserve / confirm: this session, this location. */
export type VerifyContext = { runId: string; lease: string; itemId: string };

export type RunnerDeps = {
  rpc: <T = unknown>(fn: string, args: Record<string, unknown>) => Promise<RpcResponse<T>>;
  verify: (location: LocationToVerify, remainingInr: number, ctx: VerifyContext) => Promise<VerifyOutcome>;
};

export type StepResult =
  | {
      kind: "processed";
      name: string;
      status: "done" | "retry" | "failed";
      costInr: number;
      proposals: number;
      error: string | null;
    }
  | { kind: "idle" } // queue empty: the run was finished
  | { kind: "stopped"; reason: string };

type Claim = {
  item_id: string;
  location_id: string;
  name: string;
  city_name: string;
  state_name: string;
  category: string | null;
  attempt: number;
  remaining_inr: number;
  existing: LocationToVerify["existing"];
};

const LEASE_LOST_CODE = "55000";

export async function processNextLocation(deps: RunnerDeps, runId: string, lease: string): Promise<StepResult> {
  const claim = await deps.rpc<Claim>("ai_claim_next_location", { p_run_id: runId, p_lease: lease });
  if (claim.error) {
    return { kind: "stopped", reason: claim.error.code === LEASE_LOST_CODE ? claim.error.message : `Could not start the next location: ${claim.error.message}` };
  }

  if (!claim.data) {
    const fin = await deps.rpc("ai_finish_run", { p_run_id: runId, p_lease: lease });
    if (fin.error) return { kind: "stopped", reason: fin.error.message };
    return { kind: "idle" };
  }

  const item = claim.data;
  const outcome = await deps.verify(
    { name: item.name, city_name: item.city_name, state_name: item.state_name, category: item.category, existing: item.existing },
    Number(item.remaining_inr),
    { runId, lease, itemId: item.item_id },
  );

  // Auth / quota: record what was spent, keep the location for a later retry, pause the run.
  if (outcome.quotaError) {
    const reason = `Quota or authorisation error (HTTP ${outcome.quotaError.status} from ${outcome.quotaError.stage}). Run paused; resume once it is resolved.`;
    const failed = await deps.rpc("ai_fail_location", {
      p_run_id: runId, p_lease: lease, p_item_id: item.item_id, p_error: reason, p_retry: true,
    });
    await deps.rpc("ai_pause_run", { p_run_id: runId, p_reason: reason });
    return { kind: "stopped", reason: failed.error ? `${reason} (${failed.error.message})` : reason };
  }

  // Unexpected failure of this location: retry once more if the database allows, then move on.
  if (outcome.error) {
    const failed = await deps.rpc<{ will_retry: boolean }>("ai_fail_location", {
      p_run_id: runId, p_lease: lease, p_item_id: item.item_id, p_error: outcome.error, p_retry: true,
    });
    if (failed.error) return { kind: "stopped", reason: `Could not record a failure: ${failed.error.message}` };
    return {
      kind: "processed", name: item.name, status: failed.data?.will_retry ? "retry" : "failed",
      costInr: outcome.costInr, proposals: 0, error: outcome.error,
    };
  }

  const payload: ResultPayload = outcome.result;
  const recorded = await deps.rpc<{ proposals_created: number }>("ai_record_location_result", {
    p_run_id: runId, p_lease: lease, p_item_id: item.item_id, p_result: payload,
  });
  if (recorded.error) {
    return { kind: "stopped", reason: `Spent INR ${outcome.costInr.toFixed(2)} on ${item.name} but could not record it: ${recorded.error.message}` };
  }
  return {
    kind: "processed", name: item.name, status: "done", costInr: outcome.costInr,
    proposals: recorded.data?.proposals_created ?? 0, error: null,
  };
}
