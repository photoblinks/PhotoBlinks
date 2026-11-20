// The engine adapter, run against the pipeline's own dry-run network (no live calls, no database).
import test from "node:test";
import assert from "node:assert/strict";
import { createDryRunNetwork } from "../../../prototypes/brave-gemini/dry-run-fixtures";
import { FIELD_KEYS, verifyLocation, type LocationToVerify } from "./engine";

const EMPTY: LocationToVerify["existing"] = {
  pre_wedding_shoot: null, prior_booking: null, drone_status: null, drone_permission: null, entry_fee: null, shoot_permit_fee: null,
};
const palace = (existing = EMPTY): LocationToVerify => ({
  name: "Bangalore Palace Grounds", city_name: "Bengaluru", state_name: "Karnataka", category: null, existing,
});

function deps(overrides: Record<string, unknown> = {}) {
  const net = createDryRunNetwork();
  return {
    net,
    d: { braveKey: "k", geminiKey: "k", fetchImpl: net.fetchImpl as typeof fetch, transport: net.transport, lookup: net.lookup, ...overrides },
  };
}

test("a full verification returns pending-ready proposals, within the per-location budget, with exactly 2 searches", async () => {
  const { net, d } = deps();
  const out = await verifyLocation(palace(), 2, d);
  assert.equal(out.error, null);
  assert.equal(out.quotaError, null);
  assert.equal(out.budgetStopped, false);
  assert.ok(out.costInr > 0 && out.costInr <= 2, `cost ${out.costInr}`);
  assert.equal(out.result.searches, 2);
  assert.equal(net.log.braveCalls.length, 2);
  assert.equal(out.result.verified_count, 6);
  assert.equal(out.result.proposals.length, 6);
  for (const p of out.result.proposals) {
    assert.ok(FIELD_KEYS.includes(p.field));
    assert.ok(p.proposed_value.trim().length > 0 && !/^(unknown|unverified|null)$/i.test(p.proposed_value));
    assert.ok(p.evidence.trim().length > 0);
    assert.ok(p.source_urls.length === 1 && p.source_urls[0].startsWith("https://"));
  }
  assert.equal(out.result.model, "gemini-3.1-flash-lite");
  assert.ok(out.result.source_urls.every((u) => u.startsWith("https://")));
});

test("no Gemini search grounding / tools in the model request", async () => {
  const { net, d } = deps();
  await verifyLocation(palace(), 2, d);
  assert.ok(net.log.geminiBodies.length >= 1);
  for (const body of net.log.geminiBodies) assert.equal("tools" in body, false);
});

test("existing values are passed through untouched and a value equal to the existing one is not proposed", async () => {
  const { d } = deps();
  const first = await verifyLocation(palace(), 2, d);
  const entry = first.result.proposals.find((p) => p.field === "entry_fee");
  assert.ok(entry);
  const existing = { ...EMPTY, entry_fee: entry.proposed_value, drone_status: "restricted" };
  const before = structuredClone(existing);
  const { d: d2 } = deps();
  const second = await verifyLocation(palace(existing), 2, d2);
  assert.deepEqual(existing, before); // never mutated
  assert.equal(second.result.proposals.some((p) => p.field === "entry_fee"), false); // unchanged: no proposal
  assert.ok(second.result.proposals.some((p) => p.field === "drone_status")); // different from "restricted": proposed, not applied
});

test("the per-location cap is strict: a small remaining budget stops the attempt before it overspends", async () => {
  for (const remaining of [0.3, 0.5, 0.85, 1.0, 1.2]) {
    const { d } = deps();
    const out = await verifyLocation(palace(), remaining, d);
    assert.ok(out.costInr <= remaining + 1e-9, `remaining ${remaining}: spent ${out.costInr}`);
  }
  const { net, d } = deps();
  const tiny = await verifyLocation(palace(), 0.3, d); // not even one search (about 0.42) fits
  assert.equal(tiny.budgetStopped, true);
  assert.equal(net.log.braveCalls.length, 0);
  assert.equal(tiny.costInr, 0);
  assert.equal(tiny.result.proposals.length, 0);
});

test("no budget left: nothing is spent and nothing is proposed", async () => {
  const { net, d } = deps();
  const out = await verifyLocation(palace(), 0, d);
  assert.equal(out.budgetStopped, true);
  assert.equal(out.costInr, 0);
  assert.equal(net.log.braveCalls.length, 0);
});

test("auth / quota errors are reported as quotaError (Brave 401, Gemini 429) with the money already spent", async () => {
  const brave401 = deps();
  const a = await verifyLocation(palace(), 2, {
    ...brave401.d,
    fetchImpl: (async (url: string, init?: RequestInit) =>
      new URL(url).hostname === "api.search.brave.com" ? new Response("{}", { status: 401 }) : brave401.net.fetchImpl(url, init)) as typeof fetch,
  });
  assert.deepEqual(a.quotaError, { stage: "search", status: 401 });
  assert.ok(a.error?.includes("401"));

  const g = deps({ callLlm: async () => { throw Object.assign(new Error("quota"), { status: 429 }); } });
  const b = await verifyLocation(palace(), 2, g.d);
  assert.deepEqual(b.quotaError, { stage: "llm", status: 429 });
  assert.ok(b.costInr > 0, "the two searches were already paid for");
  assert.equal(b.result.proposals.length, 0);
});

test("other failures come back as error (never thrown) and are not quota errors", async () => {
  const g = deps({ callLlm: async () => { throw new Error("network down"); } });
  const out = await verifyLocation(palace(), 2, g.d);
  assert.equal(out.quotaError, null);
  assert.match(out.error ?? "", /network down/);
  assert.equal(out.result.proposals.length, 0);
});

test("an unparseable model answer is a billed, unverified result, not a failure", async () => {
  const g = deps({ callLlm: async () => ({ text: "not json", usage: { inputTokens: 100, outputTokens: 10 } }) });
  const out = await verifyLocation(palace(), 2, g.d);
  assert.equal(out.error, null);
  assert.equal(out.result.proposals.length, 0);
  assert.equal(out.result.verified_count, 0);
});

test("no usable source page means no model call and no proposals", async () => {
  const { net, d } = deps();
  const out = await verifyLocation({ ...palace(), name: "Hampi Heritage Site", city_name: "Hampi" }, 2, d); // fixture scenario with no allowlisted sources
  assert.equal(out.result.proposals.length, 0);
  assert.equal(net.log.geminiBodies.length, 0);
});
