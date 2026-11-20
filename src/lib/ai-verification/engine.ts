// Adapter between the admin "Start AI Verification" runner and the Brave Search + Gemini
// 3.1 Flash-Lite verification pipeline in prototypes/brave-gemini (reused as is: exact-host source
// policy, pinned HTTPS fetching, exact-quote verification, news freshness, English-only gate).
//
// One call verifies ONE location and never throws: any failure comes back as `error`, together
// with the money already spent. It never touches the database directly; it returns proposals as
// plain data and reports spending through the injected `ledger`.
//
// Cost safety (the INR 2 per-location cap survives killed requests, timeouts, retries, resumes):
//   - the per-location budget (`remainingInr`) is enforced locally by reservation before every call;
//   - with a `ledger`, every paid call is ALSO reserved durably BEFORE it starts (worst case) and
//     confirmed RIGHT AFTER it ends. A reservation that never gets confirmed is charged in full by
//     the database and never released, so an interrupted attempt can only over-count, never under-count.
// Time safety: a HARD per-location deadline (45 s) aborts every outgoing request (searches, page
// fetches, the model call); nothing paid starts without enough time left; and even a dependency
// that ignores the abort cannot hold the call past deadline + grace.
//
// No cache: in a serverless request a local file cache would not persist.
import { LOCATIONS } from "../../../prototypes/brave-gemini/locations";
import { processLocation } from "../../../prototypes/brave-gemini/pipeline";
import { createSearcher } from "../../../prototypes/brave-gemini/brave";
import { createTracker } from "../../../prototypes/brave-gemini/cost";
import { createPageGetter } from "../../../prototypes/brave-gemini/page-fetch";
import { callGemini } from "../../../prototypes/brave-gemini/gemini-lite";
import cfg from "../../../prototypes/brave-gemini/config";
import { getPricing } from "../../../gemini-pricing";

const MODEL = "gemini-3.1-flash-lite";

export const FIELD_KEYS = [
  "pre_wedding_shoot",
  "prior_booking",
  "drone_status",
  "drone_permission",
  "entry_fee",
  "shoot_permit_fee",
] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];

export type LocationToVerify = {
  name: string;
  city_name: string;
  state_name: string;
  category: string | null;
  /** The location's CURRENT values, exactly as stored (null = no value). Never modified. */
  existing: Record<FieldKey, string | null>;
};

export type ProposalPayload = {
  field: FieldKey;
  proposed_value: string;
  evidence: string;
  source_urls: string[];
  confidence: number;
};

export type ResultPayload = {
  /** Informational: the database takes money from its ledger, never from this field. */
  cost_inr: number;
  searches: number;
  input_tokens: number;
  output_tokens: number;
  model: string;
  confidence: number;
  summary: string;
  source_urls: string[];
  verified_count: number;
  proposals: ProposalPayload[];
};

export type VerifyOutcome = {
  /** What was spent or is still in flight (charged in full by the ledger), for display. */
  costInr: number;
  result: ResultPayload;
  /** Set when the attempt could not be completed (unexpected failure or deadline). */
  error: string | null;
  /** Set when Brave or Gemini rejected us for auth / quota (401, 403, 429): stop the whole run. */
  quotaError: { stage: string; status: number } | null;
  /** The per-location budget (or the ledger's cap) stopped the attempt before it finished. */
  budgetStopped: boolean;
  /** The hard per-location deadline stopped the attempt. */
  deadlineExceeded: boolean;
};

/** The durable spending ledger (backed by ai_reserve_cost / ai_confirm_cost). */
export type Ledger = {
  /** Reserve the worst case of ONE paid call before it starts. Rejects if the cap or ownership fails. */
  reserve: (kind: "search" | "model", amountInr: number) => Promise<string>;
  /** Confirm the real cost right after the call. Safe to repeat; ignored once charged in full. */
  confirm: (reservationId: string, actualInr: number, usage?: { inputTokens: number; outputTokens: number }) => Promise<void>;
};

export type VerifyDeps = {
  braveKey: string;
  geminiKey: string;
  ledger?: Ledger;
  /** Hard per-location deadline in ms (default cfg.LOCATION_DEADLINE_MS = 45 s). */
  deadlineMs?: number;
  /** How long to wait for the pipeline to unwind after the abort (default cfg.DEADLINE_GRACE_MS). */
  graceMs?: number;
  /** The model call is not started with less than this left (default cfg.LLM_MIN_REMAINING_MS). */
  llmMinRemainingMs?: number;
  /** Test seams; production uses global fetch, the pinned HTTPS transport and real DNS. */
  fetchImpl?: typeof fetch;
  transport?: unknown;
  lookup?: unknown;
  callLlm?: (prompt: string) => Promise<unknown>;
};

const NO_CACHE = { get: () => undefined, set: () => undefined };
const QUOTA_STATUSES = new Set([401, 403, 429]);

type PipelineRecord = {
  proposals: { field: FieldKey; proposed_value: string; evidence: { quote: string; source_url: string } }[];
  confidence: number;
  verifiedFieldCount: number;
  summary?: string | null;
  searchStats: { networkSearches: number };
  pages: { ok: boolean; url: string }[];
  stoppedBy: string | null;
  stoppedDetail?: string;
  errors: { stage: string; message: string; status?: number }[];
};

function emptyResult(costInr: number, summary: string): ResultPayload {
  return {
    cost_inr: costInr, searches: 0, input_tokens: 0, output_tokens: 0, model: MODEL, confidence: 0,
    summary, source_urls: [], verified_count: 0, proposals: [],
  };
}

export async function verifyLocation(
  location: LocationToVerify,
  remainingInr: number,
  deps: VerifyDeps,
): Promise<VerifyOutcome> {
  const none = { quotaError: null, deadlineExceeded: false };
  if (!(remainingInr > 0)) {
    return { costInr: 0, result: emptyResult(0, "No per-location budget left."), error: null, budgetStopped: true, ...none };
  }

  const ledger = deps.ledger;
  const tracker = createTracker({
    limitInr: Number.POSITIVE_INFINITY, // no overall cap
    pricing: getPricing(MODEL),
    // The pipeline speaks "brave" / "gemini"; the ledger speaks "search" / "model".
    ledger: ledger
      ? {
          reserve: (kind: string, amountInr: number) => ledger.reserve(kind === "brave" ? "search" : "model", amountInr),
          confirm: (id: string, actualInr: number, usage?: { inputTokens: number; outputTokens: number }) => ledger.confirm(id, actualInr, usage),
        }
      : null,
  });
  tracker.beginLocation(remainingInr); // strict per-location cap, enforced by reservation before every paid call
  const fetchImpl = deps.fetchImpl ?? fetch;

  // ---- hard deadline: abort everything at deadlineMs, never wait longer than deadline + grace ----
  const deadlineMs = deps.deadlineMs ?? cfg.LOCATION_DEADLINE_MS;
  const graceMs = deps.graceMs ?? cfg.DEADLINE_GRACE_MS;
  const startedAt = Date.now();
  const controller = new AbortController();
  const signal = controller.signal;
  const timer = setTimeout(() => controller.abort(new Error("Per-location deadline")), deadlineMs);
  const deadline = {
    signal,
    timeLeftMs: () => deadlineMs - (Date.now() - startedAt),
    llmMinRemainingMs: deps.llmMinRemainingMs ?? cfg.LLM_MIN_REMAINING_MS,
  };

  // Search hints / extra official hosts for the launch locations known to the pipeline.
  const known = LOCATIONS.find((l: { name: string }) => l.name === location.name);
  const input = {
    name: location.name,
    city_name: location.city_name,
    state_name: location.state_name,
    category: location.category,
    existing: location.existing,
    officialHosts: known?.officialHosts ?? [],
    search: known?.search,
  };

  const work = processLocation(input, {
    searcher: createSearcher({ apiKey: deps.braveKey, fetchImpl, cache: NO_CACHE, tracker, signal }),
    getPage: createPageGetter({ cache: NO_CACHE, transport: deps.transport, lookup: deps.lookup, signal }),
    callLlm: deps.callLlm ?? ((prompt: string) => callGemini(prompt, { apiKey: deps.geminiKey, fetchImpl, signal })),
    tracker,
    cache: NO_CACHE,
    deadline,
  }) as Promise<unknown>;
  work.catch(() => undefined); // an abandoned run must never become an unhandled rejection

  const hardStop = new Promise<null>((resolve) => {
    signal.addEventListener("abort", () => setTimeout(() => resolve(null), graceMs), { once: true });
  });

  try {
    const record = (await Promise.race([work, hardStop])) as PipelineRecord | null;
    const inFlight = tracker.reservedInr; // calls abandoned mid-flight: charged in full by the ledger

    if (record === null) {
      const costInr = tracker.spentInr + inFlight;
      return {
        costInr,
        result: emptyResult(costInr, "Verification stopped at the per-location deadline."),
        error: `Per-location deadline of ${Math.round(deadlineMs / 1000)}s exceeded`,
        quotaError: null,
        budgetStopped: false,
        deadlineExceeded: true,
      };
    }

    const quota = record.errors.find((e) => e.status !== undefined && QUOTA_STATUSES.has(e.status));
    // A failed search / model call without an HTTP status (timeout, network). Not failures: an
    // unparseable model answer (billed, simply unverified) and the "exceeded reservation" note.
    const unexpected = record.errors.find(
      (e) => e.status === undefined && (e.stage === "search" || e.stage === "llm") && !e.message.includes("exceeded reservation"),
    );
    const deadlineStop = record.stoppedBy === "deadline";
    const costInr = tracker.spentInr + inFlight;

    const result: ResultPayload = {
      cost_inr: costInr,
      searches: record.searchStats.networkSearches,
      input_tokens: tracker.totals.inputTokens,
      output_tokens: tracker.totals.outputTokens,
      model: MODEL,
      confidence: record.confidence,
      summary:
        record.summary ??
        `${record.verifiedFieldCount}/6 fields verified${record.errors.length ? `; ${record.errors.length} issue(s)` : ""}.`,
      source_urls: record.pages.filter((p) => p.ok).map((p) => p.url),
      verified_count: record.verifiedFieldCount,
      // Only fully verified, real, changed values reach this list (proposals.js); the database
      // re-validates and stores them as PENDING.
      proposals: record.proposals.map((p) => ({
        field: p.field,
        proposed_value: p.proposed_value,
        evidence: p.evidence.quote,
        source_urls: [p.evidence.source_url],
        confidence: record.confidence,
      })),
    };

    return {
      costInr,
      result,
      error: quota
        ? `HTTP ${quota.status} from ${quota.stage}`
        : deadlineStop
          ? `Per-location deadline of ${Math.round(deadlineMs / 1000)}s reached`
          : unexpected
            ? `${unexpected.stage}: ${unexpected.message}`
            : null,
      quotaError: quota ? { stage: quota.stage, status: quota.status as number } : null,
      budgetStopped: record.stoppedBy === "budget",
      deadlineExceeded: deadlineStop,
    };
  } catch (e) {
    const costInr = tracker.spentInr + tracker.reservedInr;
    return {
      costInr,
      result: emptyResult(costInr, "Verification failed."),
      error: e instanceof Error ? e.message : String(e),
      quotaError: null,
      budgetStopped: false,
      deadlineExceeded: false,
    };
  } finally {
    clearTimeout(timer);
  }
}
