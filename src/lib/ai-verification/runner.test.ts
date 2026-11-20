// The one-step runner with a fake database and fake verifier: failure handling, quota stop,
// lease loss, recording, and the guarantee that only the admin-only AI functions are ever called.
import test from "node:test";
import assert from "node:assert/strict";
import { processNextLocation, type RpcResponse, type RunnerDeps } from "./runner";
import type { LocationToVerify, VerifyOutcome } from "./engine";

const RUN = "11111111-1111-4111-8111-111111111111";
const LEASE = "22222222-2222-4222-8222-222222222222";

const EXISTING: LocationToVerify["existing"] = {
  pre_wedding_shoot: "allowed", prior_booking: "", drone_status: null, drone_permission: "Call the office", entry_fee: "₹30", shoot_permit_fee: null,
};
const claim = (over: Record<string, unknown> = {}) => ({
  item_id: "item-1", location_id: "loc-1", name: "Fort Kochi", city_name: "Kochi", state_name: "Kerala", category: "Beach",
  attempt: 1, remaining_inr: 2, existing: EXISTING, ...over,
});
const okOutcome = (over: Partial<VerifyOutcome> = {}): VerifyOutcome => ({
  costInr: 0.92, error: null, quotaError: null, budgetStopped: false, deadlineExceeded: false,
  result: {
    cost_inr: 0.92, searches: 2, input_tokens: 2000, output_tokens: 300, model: "gemini-3.1-flash-lite", confidence: 0.5, summary: "s",
    source_urls: ["https://www.keralatourism.org/x"], verified_count: 1,
    proposals: [{ field: "entry_fee", proposed_value: "₹40", evidence: "Entry fee: ₹40", source_urls: ["https://www.keralatourism.org/x"], confidence: 0.5 }],
  },
  ...over,
});

type Call = { fn: string; args: Record<string, unknown> };
function harness(handlers: Record<string, (args: Record<string, unknown>) => RpcResponse<unknown>>, outcome: VerifyOutcome | (() => Promise<VerifyOutcome>) = okOutcome()) {
  const calls: Call[] = [];
  const verified: { location: LocationToVerify; remaining: number; ctx: { runId: string; lease: string; itemId: string } }[] = [];
  const deps: RunnerDeps = {
    rpc: (async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      const h = handlers[fn];
      if (!h) throw new Error(`unexpected rpc ${fn}`);
      return h(args);
    }) as RunnerDeps["rpc"],
    verify: async (location, remaining, ctx) => {
      verified.push({ location, remaining, ctx });
      return typeof outcome === "function" ? outcome() : outcome;
    },
  };
  return { deps, calls, verified };
}
const ok = <T,>(data: T): RpcResponse<T> => ({ data, error: null });
const err = (message: string, code?: string): RpcResponse<never> => ({ data: null, error: { message, code } });

test("idle: queue empty finishes the run", async () => {
  const h = harness({ ai_claim_next_location: () => ok(null), ai_finish_run: () => ok({ status: "succeeded" }) });
  assert.deepEqual(await processNextLocation(h.deps, RUN, LEASE), { kind: "idle" });
  assert.deepEqual(h.calls.map((c) => c.fn), ["ai_claim_next_location", "ai_finish_run"]);
  assert.equal(h.verified.length, 0);
});

test("lease lost: stops without verifying anything", async () => {
  const h = harness({ ai_claim_next_location: () => err("This session no longer holds the run.", "55000") });
  const r = await processNextLocation(h.deps, RUN, LEASE);
  assert.equal(r.kind, "stopped");
  assert.equal(h.verified.length, 0);
});

test("a claim error other than lease loss stops with a readable reason", async () => {
  const h = harness({ ai_claim_next_location: () => err("boom", "XX000") });
  const r = await processNextLocation(h.deps, RUN, LEASE);
  assert.equal(r.kind, "stopped");
  assert.match((r as { reason: string }).reason, /Could not start the next location/);
});

test("success: records the result for exactly this location, with the remaining per-location budget passed to the verifier", async () => {
  const h = harness({
    ai_claim_next_location: () => ok(claim({ remaining_inr: 1.1, attempt: 2 })),
    ai_record_location_result: () => ok({ proposals_created: 1 }),
  });
  const r = await processNextLocation(h.deps, RUN, LEASE);
  assert.deepEqual(r, { kind: "processed", name: "Fort Kochi", status: "done", costInr: 0.92, proposals: 1, error: null });
  assert.equal(h.verified[0].remaining, 1.1); // the cap carried over from earlier attempts
  const rec = h.calls.find((c) => c.fn === "ai_record_location_result");
  assert.ok(rec);
  assert.equal(rec.args.p_run_id, RUN);
  assert.equal(rec.args.p_lease, LEASE);
  assert.equal(rec.args.p_item_id, "item-1");
  assert.deepEqual(rec.args.p_result, okOutcome().result);
});

test("existing location data reaches the verifier exactly as stored (null, empty string and text) and is never modified", async () => {
  const snapshot = structuredClone(EXISTING);
  const h = harness({ ai_claim_next_location: () => ok(claim()), ai_record_location_result: () => ok({ proposals_created: 1 }) });
  await processNextLocation(h.deps, RUN, LEASE);
  assert.deepEqual(h.verified[0].location.existing, snapshot);
  assert.strictEqual(h.verified[0].location.existing.prior_booking, "");
  assert.strictEqual(h.verified[0].location.existing.drone_status, null);
});

test("only the admin-only ai_* functions are ever called: no direct table or location write", async () => {
  const h = harness({ ai_claim_next_location: () => ok(claim()), ai_record_location_result: () => ok({ proposals_created: 1 }) });
  await processNextLocation(h.deps, RUN, LEASE);
  for (const c of h.calls) assert.match(c.fn, /^ai_(claim_next_location|record_location_result|fail_location|pause_run|finish_run)$/);
});

test("a failure on one location is recorded (with the money spent), retried when allowed, and never stops the run", async () => {
  for (const [willRetry, status] of [[true, "retry"], [false, "failed"]] as const) {
    const h = harness(
      { ai_claim_next_location: () => ok(claim()), ai_fail_location: () => ok({ will_retry: willRetry, item_cost_inr: 0.9 }) },
      okOutcome({ error: "llm: network down", costInr: 0.9 }),
    );
    const r = await processNextLocation(h.deps, RUN, LEASE);
    assert.deepEqual(r, { kind: "processed", name: "Fort Kochi", status, costInr: 0.9, proposals: 0, error: "llm: network down" });
    const f = h.calls.find((c) => c.fn === "ai_fail_location");
    assert.ok(f);
    assert.equal("p_cost" in f.args, false, "money is never reported by the runner: the ledger holds it");
    assert.equal(f.args.p_retry, true);
    assert.equal(h.calls.some((c) => c.fn === "ai_record_location_result" || c.fn === "ai_pause_run"), false);
  }
});

test("quota / auth error: cost recorded, location kept for a later retry, run paused immediately", async () => {
  const h = harness(
    { ai_claim_next_location: () => ok(claim()), ai_fail_location: () => ok({ will_retry: true }), ai_pause_run: () => ok({ status: "queued" }) },
    okOutcome({ error: "HTTP 429 from search", quotaError: { stage: "search", status: 429 }, costInr: 0.42 }),
  );
  const r = await processNextLocation(h.deps, RUN, LEASE);
  assert.equal(r.kind, "stopped");
  assert.match((r as { reason: string }).reason, /HTTP 429/);
  assert.deepEqual(h.calls.map((c) => c.fn), ["ai_claim_next_location", "ai_fail_location", "ai_pause_run"]);
  const f = h.calls[1];
  assert.equal("p_cost" in f.args, false);
  assert.equal(f.args.p_retry, true);
  assert.match(String(h.calls[2].args.p_reason), /429/);
});

test("a result that cannot be recorded stops the run and says how much was spent", async () => {
  const h = harness({ ai_claim_next_location: () => ok(claim()), ai_record_location_result: () => err("db down", "XX000") });
  const r = await processNextLocation(h.deps, RUN, LEASE);
  assert.equal(r.kind, "stopped");
  assert.match((r as { reason: string }).reason, /0\.92/);
});

test("a failure that cannot be recorded stops the run (nothing silently lost)", async () => {
  const h = harness({ ai_claim_next_location: () => ok(claim()), ai_fail_location: () => err("db down") }, okOutcome({ error: "x", costInr: 0.1 }));
  const r = await processNextLocation(h.deps, RUN, LEASE);
  assert.equal(r.kind, "stopped");
});

test("budget-stopped attempts are recorded as normal (inconclusive) results, not failures", async () => {
  const h = harness(
    { ai_claim_next_location: () => ok(claim({ remaining_inr: 0.6 })), ai_record_location_result: () => ok({ proposals_created: 0 }) },
    okOutcome({ budgetStopped: true, costInr: 0.42, result: { ...okOutcome().result, cost_inr: 0.42, proposals: [], verified_count: 0 } }),
  );
  const r = await processNextLocation(h.deps, RUN, LEASE);
  assert.equal(r.kind, "processed");
  assert.equal((r as { status: string }).status, "done");
  assert.equal(h.calls.some((c) => c.fn === "ai_fail_location"), false);
});

test("a run is processed strictly one location per step, in claim order, until idle", async () => {
  const queue = [claim({ item_id: "a", name: "A" }), claim({ item_id: "b", name: "B" })];
  const h = harness({
    ai_claim_next_location: () => ok(queue.shift() ?? null),
    ai_record_location_result: () => ok({ proposals_created: 0 }),
    ai_finish_run: () => ok({ status: "succeeded" }),
  });
  const seen: string[] = [];
  for (;;) {
    const r = await processNextLocation(h.deps, RUN, LEASE);
    if (r.kind === "processed") seen.push(r.name);
    else { assert.equal(r.kind, "idle"); break; }
  }
  assert.deepEqual(seen, ["A", "B"]);
  assert.equal(h.verified.length, 2);
});

test("the verifier is handed the ownership the cost ledger checks (this run, this session, this location)", async () => {
  const h = harness({ ai_claim_next_location: () => ok(claim({ item_id: "item-9" })), ai_record_location_result: () => ok({ proposals_created: 0 }) });
  await processNextLocation(h.deps, RUN, LEASE);
  assert.deepEqual(h.verified[0].ctx, { runId: RUN, lease: LEASE, itemId: "item-9" });
});

test("a deadline stop is a failed attempt (retried once by the database if budget allows), never a recorded result", async () => {
  const h = harness(
    { ai_claim_next_location: () => ok(claim()), ai_fail_location: () => ok({ will_retry: true, item_cost_inr: 0.83 }) },
    okOutcome({ error: "Per-location deadline of 45s exceeded", deadlineExceeded: true, costInr: 0.83 }),
  );
  const r = await processNextLocation(h.deps, RUN, LEASE);
  assert.equal(r.kind, "processed");
  assert.equal((r as { status: string }).status, "retry");
  assert.equal(h.calls.some((c) => c.fn === "ai_record_location_result"), false);
  const f = h.calls.find((c) => c.fn === "ai_fail_location");
  assert.ok(f);
  assert.equal(f.args.p_retry, true);
});

test("no runner call ever carries a cost amount: spending reaches the database only through the verifier's ledger", async () => {
  const h = harness({
    ai_claim_next_location: () => ok(claim()), ai_record_location_result: () => ok({ proposals_created: 1 }),
    ai_fail_location: () => ok({ will_retry: false }), ai_pause_run: () => ok({}),
  });
  await processNextLocation(h.deps, RUN, LEASE);
  for (const c of h.calls) for (const key of Object.keys(c.args)) assert.ok(!/cost|amount/i.test(key) || key === "p_result", `${c.fn} sends ${key}`);
});
