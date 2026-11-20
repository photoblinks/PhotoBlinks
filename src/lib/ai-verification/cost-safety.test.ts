// Regression tests for the two production blockers found in the final audit:
//   1. the INR 2 per-location cap must survive killed requests, timeouts, retries and resumes;
//   2. a HARD 45 s per-location deadline with abortable requests.
// Everything runs against the pipeline's dry-run network: no live calls, no database.
import test from "node:test";
import assert from "node:assert/strict";
import { createDryRunNetwork } from "../../../prototypes/brave-gemini/dry-run-fixtures";
import { verifyLocation, type Ledger, type LocationToVerify } from "./engine";

const EMPTY: LocationToVerify["existing"] = {
  pre_wedding_shoot: null, prior_booking: null, drone_status: null, drone_permission: null, entry_fee: null, shoot_permit_fee: null,
};
const palace = (): LocationToVerify => ({ name: "Bangalore Palace Grounds", city_name: "Bengaluru", state_name: "Karnataka", category: null, existing: EMPTY });

function base() {
  const net = createDryRunNetwork();
  return { net, d: { braveKey: "k", geminiKey: "k", fetchImpl: net.fetchImpl as typeof fetch, transport: net.transport, lookup: net.lookup } };
}

/** An in-memory copy of the database ledger's rules (ai_reserve_cost / ai_confirm_cost / charge-outstanding). */
class MemoryLedger implements Ledger {
  cap = 2;
  confirmed = 0; // confirmed spend + pessimistic charges
  reserved = 0; // in flight, unconfirmed
  events: string[] = [];
  private rows = new Map<string, { amount: number; status: "reserved" | "confirmed" | "charged" }>();
  private n = 0;
  reserve = async (kind: "search" | "model", amountInr: number) => {
    if (this.confirmed + this.reserved + amountInr > this.cap + 1e-6) throw new Error("Per-location spending cap would be exceeded");
    const id = `r${++this.n}`;
    this.rows.set(id, { amount: amountInr, status: "reserved" });
    this.reserved += amountInr;
    this.events.push(`reserve:${kind}`);
    return id;
  };
  confirm = async (id: string, actualInr: number) => {
    const r = this.rows.get(id);
    if (!r || r.status !== "reserved") return; // idempotent: late / repeated confirmations change nothing
    r.status = "confirmed";
    this.reserved -= r.amount;
    this.confirmed += actualInr;
    this.events.push("confirm");
  };
  /** What the database does when an attempt is closed or resumed: unconfirmed reservations are charged IN FULL. */
  chargeOutstanding() {
    for (const r of this.rows.values()) if (r.status === "reserved") { r.status = "charged"; this.confirmed += r.amount; }
    this.reserved = 0;
  }
  get worstCase() { return this.confirmed + this.reserved; }
}

const hangsUntilAborted = (signal?: AbortSignal | null) =>
  new Promise<never>((_, reject) => signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
const NEVER = () => new Promise<never>(() => undefined);

// ------------------------------------------------------------------ ledger protocol

test("ledger protocol: every paid call is reserved BEFORE it starts and confirmed right AFTER, in order", async () => {
  const ledger = new MemoryLedger();
  const { net, d } = base();
  const out = await verifyLocation(palace(), 2, {
    ...d, ledger,
    fetchImpl: (async (url: string, init?: RequestInit) => {
      ledger.events.push(`fetch:${new URL(url).hostname.includes("brave") ? "brave" : "gemini"}`);
      return net.fetchImpl(url, init);
    }) as typeof fetch,
  });
  assert.equal(out.error, null);
  assert.deepEqual(ledger.events, [
    "reserve:search", "fetch:brave", "confirm",
    "reserve:search", "fetch:brave", "confirm",
    "reserve:model", "fetch:gemini", "confirm",
  ]);
  assert.equal(ledger.reserved, 0, "nothing left in flight");
  assert.ok(Math.abs(ledger.confirmed - out.costInr) < 1e-9, "the ledger holds exactly what the engine reports");
  assert.ok(ledger.worstCase <= 2);
});

test("ledger cap: a refused reservation stops the attempt cleanly, with no paid call made after it", async () => {
  const ledger = new MemoryLedger();
  ledger.cap = 0.5; // room for one search (about 0.42), not two
  const { net, d } = base();
  const out = await verifyLocation(palace(), 2, { ...d, ledger });
  assert.equal(out.budgetStopped, true);
  assert.equal(net.log.braveCalls.length, 1);
  assert.equal(net.log.geminiBodies.length, 0);
  assert.ok(ledger.worstCase <= 0.5 + 1e-9);
});

test("a lost confirmation never breaks the attempt; the reservation just stays held (charged in full later)", async () => {
  const ledger = new MemoryLedger();
  ledger.confirm = async () => { throw new Error("network"); };
  const out = await verifyLocation(palace(), 2, { ...base().d, ledger });
  assert.equal(out.error, null);
  assert.ok(ledger.reserved > 0);
});

test("no ledger (CLI / tests): behaviour is unchanged", async () => {
  const out = await verifyLocation(palace(), 2, base().d);
  assert.equal(out.error, null);
  assert.equal(out.result.verified_count, 6);
});

// ------------------------------------------------------------------ BLOCKER 1

test("REGRESSION 1: a killed model call can no longer let a location pass INR 2 across retries and resumes", async () => {
  const ledger = new MemoryLedger();
  // Attempt 1: the two searches succeed, then the request is killed mid model call (it never answers, ignores the abort).
  const first = await verifyLocation(palace(), 2, { ...base().d, ledger, deadlineMs: 500, graceMs: 100, llmMinRemainingMs: 0, callLlm: NEVER });
  assert.equal(first.deadlineExceeded, true);
  assert.ok(ledger.reserved > 0, "the model call's worst case is still held as an uncertain reservation");
  const confirmedSearches = ledger.confirmed;
  assert.ok(confirmedSearches > 0.8 && confirmedSearches < 0.9, `two searches confirmed: ${confirmedSearches}`);

  // The page is reopened and the run resumed: the uncertain reservation is charged IN FULL (never released).
  ledger.chargeOutstanding();
  assert.ok(ledger.confirmed > confirmedSearches, "the uncertain call was charged, not forgotten");

  // Attempt 2 gets only what is LEFT, and the ledger refuses anything beyond the cap.
  const remaining = Math.max(ledger.cap - ledger.confirmed, 0);
  await verifyLocation(palace(), remaining, { ...base().d, ledger });
  assert.ok(ledger.worstCase <= 2 + 1e-9, `worst case for the location is ${ledger.worstCase} (it reached about 2.93 before the ledger)`);
});

test("REGRESSION 1b: the old accounting (nothing recorded for a killed call) could reach about 3.7; the ledger shrinks the retry budget", async () => {
  const realSpendAttempt1 = 0.83 + 0.85; // two searches + a model call that WAS billed but never recorded
  assert.ok(realSpendAttempt1 + 2 > 2, "old accounting handed the retry a fresh INR 2");
  const ledger = new MemoryLedger();
  await verifyLocation(palace(), 2, { ...base().d, ledger, deadlineMs: 500, graceMs: 100, llmMinRemainingMs: 0, callLlm: NEVER });
  ledger.chargeOutstanding();
  assert.ok(ledger.confirmed >= 0.83 + 0.05);
  assert.ok(ledger.cap - ledger.confirmed < 2 - 0.83, "the retry budget is what is LEFT, not a fresh 2");
});

test("every cap violation is refused at reservation time, whatever order the calls come in", async () => {
  const ledger = new MemoryLedger();
  await ledger.reserve("search", 0.415);
  await ledger.reserve("search", 0.415);
  await ledger.reserve("model", 0.85); // 1.68 in flight, nothing confirmed yet
  await assert.rejects(ledger.reserve("model", 0.85), /cap would be exceeded/);
  ledger.chargeOutstanding(); // killed: all three charged in full
  assert.ok(Math.abs(ledger.confirmed - 1.68) < 1e-9);
  await assert.rejects(ledger.reserve("search", 0.415), /cap would be exceeded/);
});

// ------------------------------------------------------------------ BLOCKER 2

test("REGRESSION 2: a request that never answers cannot hold the location past the deadline (even if it ignores the abort)", async () => {
  const started = Date.now();
  const out = await verifyLocation(palace(), 2, { ...base().d, deadlineMs: 300, graceMs: 100, llmMinRemainingMs: 0, callLlm: NEVER });
  const elapsed = Date.now() - started;
  assert.equal(out.deadlineExceeded, true);
  assert.match(out.error ?? "", /deadline/i);
  assert.equal(out.quotaError, null);
  assert.ok(elapsed < 1500, `returned after ${elapsed} ms`);
});

test("REGRESSION 2b: abortable requests are really aborted at the deadline (search, page fetch, model call)", async () => {
  const net = createDryRunNetwork();
  const aborted: string[] = [];

  // search hangs
  const a = await verifyLocation(palace(), 2, {
    braveKey: "k", geminiKey: "k", deadlineMs: 300, graceMs: 800, transport: net.transport, lookup: net.lookup,
    fetchImpl: ((_url: string, init?: RequestInit) => {
      init?.signal?.addEventListener("abort", () => aborted.push("search"));
      return hangsUntilAborted(init?.signal);
    }) as unknown as typeof fetch,
  });
  assert.equal(a.deadlineExceeded, true);
  assert.deepEqual(aborted, ["search"]);

  // page fetch hangs
  const t0 = Date.now();
  const b = await verifyLocation(palace(), 2, {
    braveKey: "k", geminiKey: "k", deadlineMs: 400, graceMs: 800, fetchImpl: net.fetchImpl as typeof fetch, lookup: net.lookup,
    transport: (req: { signal?: AbortSignal }) => {
      req.signal?.addEventListener("abort", () => aborted.push("page"));
      return hangsUntilAborted(req.signal);
    },
  });
  assert.ok(Date.now() - t0 < 2500);
  assert.equal(b.result.proposals.length, 0);
  assert.ok(aborted.includes("page"));

  // model call hangs (the real callGemini path: the signal reaches fetch)
  const llmAborted: string[] = [];
  const c = await verifyLocation(palace(), 2, {
    braveKey: "k", geminiKey: "k", deadlineMs: 600, graceMs: 800, llmMinRemainingMs: 0, transport: net.transport, lookup: net.lookup,
    fetchImpl: ((url: string, init?: RequestInit) => {
      if (new URL(url).hostname.includes("generativelanguage")) {
        init?.signal?.addEventListener("abort", () => llmAborted.push("model"));
        return hangsUntilAborted(init?.signal);
      }
      return net.fetchImpl(url, init);
    }) as typeof fetch,
  });
  assert.deepEqual(llmAborted, ["model"]);
  assert.notEqual(c.error, null);
  assert.equal(c.result.proposals.length, 0);
});

test("an aborted paid call is confirmed as billed (never forgotten), so the ledger stays an upper bound", async () => {
  const ledger = new MemoryLedger();
  const net = createDryRunNetwork();
  await verifyLocation(palace(), 2, {
    braveKey: "k", geminiKey: "k", ledger, deadlineMs: 300, graceMs: 800, transport: net.transport, lookup: net.lookup,
    fetchImpl: ((_url: string, init?: RequestInit) => hangsUntilAborted(init?.signal)) as unknown as typeof fetch,
  });
  assert.equal(ledger.reserved, 0, "the aborted search was settled");
  assert.ok(ledger.confirmed > 0, "and counted as spent");
});

test("not enough time left for the model call (default 12 s minimum): it is never started", async () => {
  let llmCalls = 0;
  const out = await verifyLocation(palace(), 2, { ...base().d, deadlineMs: 5000, callLlm: async () => { llmCalls++; throw new Error("must not run"); } });
  assert.equal(llmCalls, 0);
  assert.equal(out.deadlineExceeded, true);
  assert.match(out.error ?? "", /deadline/i);
  assert.ok(out.costInr > 0 && out.costInr < 1, "only the searches were paid");
});

test("production deadline: 45 s with a short grace, well inside the 60 s server-action limit", async () => {
  const mod = await import("../../../prototypes/brave-gemini/config");
  const cfg = (mod.default ?? mod) as { LOCATION_DEADLINE_MS: number; DEADLINE_GRACE_MS: number; LLM_MIN_REMAINING_MS: number };
  assert.equal(cfg.LOCATION_DEADLINE_MS, 45_000);
  assert.ok(cfg.LOCATION_DEADLINE_MS + cfg.DEADLINE_GRACE_MS <= 47_000);
  assert.ok(cfg.LLM_MIN_REMAINING_MS >= 10_000);
});
