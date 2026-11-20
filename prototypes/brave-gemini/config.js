// Isolated prototype: Brave Search + Gemini 3.1 Flash-Lite. No database, no Gemini search
// grounding, no approvals. Every limit here is enforced in code, not by prompts.
module.exports = Object.freeze({
  MODEL: 'gemini-3.1-flash-lite',

  // Hard cap on search() CALLS per location (cache hits count too), so network searches <= 2.
  MAX_SEARCHES_PER_LOCATION: 2,
  SEARCH_RESULTS_PER_QUERY: 10,

  MAX_PAGES_PER_LOCATION: 3,
  MAX_REDIRECTS: 3,
  PAGE_MAX_BYTES: 1_500_000,
  PAGE_TIMEOUT_MS: 10_000,
  SEARCH_TIMEOUT_MS: 15_000,
  LLM_TIMEOUT_MS: 60_000,

  // HARD per-location deadline: every outgoing request is aborted at this point and no new paid
  // call starts without enough time left. Must stay well under the host's function limit.
  LOCATION_DEADLINE_MS: 45_000,
  // Do not START the model call with less than this much time left (it would be aborted mid-flight
  // and billed for nothing).
  LLM_MIN_REMAINING_MS: 12_000,
  // After the deadline aborts, how long the engine waits for the pipeline to unwind before returning.
  DEADLINE_GRACE_MS: 1_500,

  // Evidence sent to the model: at most 3 pages x 12,000 chars.
  EXCERPT_CHARS_PER_PAGE: 12_000,
  MAX_OUTPUT_TOKENS: 4096,
  MAX_QUOTE_CHARS: 400,
  MIN_QUOTE_CHARS: 12,

  // prior_booking / drone_permission contract: 'excerpt' = the value must be a contiguous piece of
  // its quote (no paraphrase). 'paraphrase' enables the synonym/stem matcher instead.
  FREE_TEXT_MODE: 'excerpt',
  MAX_EXCERPT_WORDS: 40,
  // A qualifier (only / unless / except / ...) counts as attached to a value when it sits in the
  // same sentence within this many words of the words the value covers.
  QUALIFIER_DISTANCE: 4,

  // News is used only for current conditions: older (or undated) articles are rejected.
  NEWS_MAX_AGE_DAYS: 365,

  CACHE_TTL_DAYS: Object.freeze({ search: 30, page: 30, robots: 7, llm: 30 }),

  // Brave Search API: $5 per 1,000 requests (third-party summaries; verify on brave.com).
  // The $5 monthly credit is ignored, so spend is overstated, never understated.
  BRAVE_USD_PER_SEARCH: 5 / 1000,

  // Strict total budget for the whole 5-location test.
  TEST_BUDGET_INR: 10,
  // Per-location ceiling, enforced by reservation like the total budget.
  PER_LOCATION_CEILING_INR: 2,

  // Generic UA: never send project or personal details to third-party sites.
  USER_AGENT: 'LocationVerifierBot/0.1',

  // Conservative token estimate for reservations: chars / 3, plus 25% margin.
  CHARS_PER_TOKEN_ESTIMATE: 3,
  INPUT_SAFETY_MARGIN: 1.25,
});
