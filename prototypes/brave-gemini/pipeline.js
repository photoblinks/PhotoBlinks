// One location: <=2 Brave searches -> filter to trusted domains -> fetch pages -> ONE Gemini
// call (no tools) -> verify every field against the real page text. Nothing is written to any
// database and nothing is approved: the output is a proposal record for manual review.
const crypto = require('node:crypto');
const { classifySource, allowUrlFor } = require('./source-policy');
const { BudgetError } = require('./cost');
const { relevantExcerpt } = require('./page-fetch');
const { buildPrompt, parseModelJson } = require('./gemini-lite');
const { verifyFields } = require('./verify');
const { buildProposals } = require('./proposals');
const cfg = require('./config');

// The state's own tourism board name nudges the search toward official pages (the source policy
// rejects blogs and aggregators, which dominated earlier results). Still exactly two queries.
const TOURISM_BOARD = { karnataka: 'Karnataka Tourism', kerala: 'Kerala Tourism' };

// A location can add search wording (`search.aliases` / `search.authorities`) when generic queries
// mostly return blogs; otherwise the state's tourism board is used. Always exactly two queries.
function buildQueries(location) {
  const aliases = (location.search?.aliases || []).filter(a => !`${location.name} ${location.city_name}`.toLowerCase().includes(a.toLowerCase()));
  const where = [location.name, location.city_name, ...aliases].join(' ');
  const board = TOURISM_BOARD[String(location.state_name).toLowerCase()] || `${location.state_name} tourism`;
  const authorities = (location.search?.authorities || [board]).join(' ');
  return [
    `${where} pre-wedding photography permission drone policy official ${authorities}`,
    `${where} entry fee ticket price photography permit fee official ${authorities}`,
  ];
}

// Trusted, de-duplicated results: official sites first, then reputable news; Brave order within each.
function selectSources(resultSets, location) {
  const seen = new Set();
  const audit = [];
  const usable = [];
  for (const { query, results } of resultSets) {
    results.forEach((r, rank) => {
      const { tier, reason: policyReason } = classifySource(r.url, location);
      const reason = seen.has(r.url) ? 'duplicate' : policyReason;
      seen.add(r.url);
      audit.push({ query, rank, url: r.url, title: r.title, tier, kept: reason === null, dropReason: reason });
      if (reason === null) usable.push({ ...r, rank, tier });
    });
  }
  usable.sort((a, b) => Number(b.tier === 'official') - Number(a.tier === 'official') || a.rank - b.rank);
  return { audit, selected: usable.slice(0, cfg.MAX_PAGES_PER_LOCATION) };
}

const sha = s => crypto.createHash('sha256').update(s).digest('hex');

async function processLocation(location, ctx) {
  const { searcher, getPage, callLlm, tracker, cache, deadline } = ctx;
  // deadline (optional) = { signal, timeLeftMs() }: the hard per-location deadline. Nothing new is started
  // once it has passed, and the model call needs cfg.LLM_MIN_REMAINING_MS left.
  const timeLeft = () => (deadline ? deadline.timeLeftMs() : Infinity);
  const stopForDeadline = () => { record.stoppedBy = 'deadline'; record.stoppedDetail = 'Per-location deadline reached'; };
  const startSpent = tracker.spentInr;
  const record = {
    location,
    queries: buildQueries(location),
    searches: [],
    searchResults: [],
    pages: [],
    llm: null,
    fields: null,
    confidence: 0,
    verifiedFieldCount: 0,
    stoppedBy: null,
    errors: [],
  };
  const finish = () => {
    record.searchStats = { ...searcher.stats };
    record.costInr = tracker.spentInr - startSpent;
    // Only fully verified, real, changed values become PENDING proposals; everything else is kept as is.
    Object.assign(record, buildProposals(location, record.fields));
    return record;
  };

  // 1. Searches (hard cap enforced inside searcher).
  const resultSets = [];
  for (const query of record.queries) {
    if (timeLeft() <= 0) { stopForDeadline(); break; }
    try {
      const { results, cached } = await searcher.search(query);
      resultSets.push({ query, results });
      record.searches.push({ query, cached, resultCount: results.length });
    } catch (e) {
      if (e instanceof BudgetError) { record.stoppedBy = 'budget'; record.stoppedDetail = e.message; break; }
      if (deadline?.signal?.aborted) { stopForDeadline(); break; }
      record.errors.push({ stage: 'search', query, message: e.message, status: e.status });
    }
  }

  // 2. Trusted sources + page fetch.
  const { audit, selected } = selectSources(resultSets, location);
  const allowUrl = allowUrlFor(location);
  record.searchResults = audit;
  const pages = [];
  for (const s of selected) {
    if (timeLeft() <= 0) { stopForDeadline(); break; }
    const page = await getPage(s.url, allowUrl);
    record.pages.push(page.ok
      ? { url: page.url, ok: true, tier: classifySource(page.url, location).tier, published: page.published ?? null, chars: page.text.length, truncated: page.truncated, cached: !!page.cached }
      : { url: s.url, ok: false, reason: page.reason, detail: page.detail });
    if (page.ok) pages.push({ url: page.url, text: page.text, tier: classifySource(page.url, location).tier, published: page.published ?? null });
  }
  if (pages.length === 0) {
    record.fields = verifyFields(location, null, []).results;
    return finish();
  }

  // 3. One model call (cache first, then reserved + metered).
  if (record.stoppedBy === 'deadline' || timeLeft() < (deadline?.llmMinRemainingMs ?? cfg.LLM_MIN_REMAINING_MS)) {
    if (record.stoppedBy !== 'deadline') stopForDeadline();
    record.fields = verifyFields(location, null, []).results;
    return finish();
  }
  const prompt = buildPrompt(location, pages.map(p => ({ url: p.url, excerpt: relevantExcerpt(p.text, cfg.EXCERPT_CHARS_PER_PAGE) })));
  const llmKey = `${cfg.MODEL}\n${sha(prompt)}`;
  let llm = cache.get('llm', llmKey);
  if (llm) {
    tracker.totals.cacheHits++;
    record.llm = { cached: true, promptChars: prompt.length, usage: llm.usage, costInr: 0 };
  } else {
    let reservation;
    try {
      reservation = await tracker.reserveAsync('gemini', tracker.estimateLlmCostInr(prompt.length)); // reserved BEFORE the call
    } catch (e) {
      if (e instanceof BudgetError) { record.stoppedBy = 'budget'; record.stoppedDetail = e.message; record.fields = verifyFields(location, null, []).results; return finish(); }
      throw e;
    }
    try {
      tracker.totals.llmCalls++;
      llm = await callLlm(prompt);
      const actual = tracker.llmCostInr(llm.usage);
      tracker.totals.inputTokens += llm.usage.inputTokens;
      tracker.totals.outputTokens += llm.usage.outputTokens;
      await tracker.settleAsync(reservation, actual, llm.usage); // confirmed right after the call
      if (actual > reservation.estimateInr) record.errors.push({ stage: 'llm', message: `actual ₹${actual.toFixed(4)} exceeded reservation ₹${reservation.estimateInr.toFixed(4)}` });
      cache.set('llm', llmKey, { text: llm.text, usage: llm.usage });
      record.llm = { cached: false, promptChars: prompt.length, usage: llm.usage, finishReason: llm.finishReason, costInr: actual };
    } catch (e) {
      // HTTP-status failures are not billed; unknown failures (timeouts) are assumed billed.
      await tracker.settleAsync(reservation, typeof e.status === 'number' ? 0 : reservation.estimateInr);
      if (deadline?.signal?.aborted) stopForDeadline();
      record.errors.push({ stage: 'llm', message: e.message, status: e.status });
      record.fields = verifyFields(location, null, pages).results;
      return finish();
    }
  }

  // 4. Verify against the real page text.
  const parsed = parseModelJson(llm.text);
  if (!parsed) record.errors.push({ stage: 'parse', message: 'model output was not valid JSON with a "fields" object' });
  const verified = verifyFields(location, parsed?.fields, pages);
  record.fields = verified.results;
  record.confidence = verified.confidence;
  record.verifiedFieldCount = Object.values(verified.fieldVerified).filter(Boolean).length;
  record.summary = parsed?.summary ?? null;
  return finish();
}

module.exports = { processLocation, buildQueries, selectSources };
