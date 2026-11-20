require('dotenv').config({ path: '.env.local' });
const {
  FIELD_NAMES, FEE_FIELDS,
  isOfficialSource, isVertexRedirect, sourceRejectionReason,
  pickVerifiedField, isTransientError, computeConfidence, filterSources,
} = require('./gemini-verification');
const { getPricing, calculateCost, BudgetExceededError } = require('./gemini-pricing');

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = 'gemini-3.8-flash';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
// Architecture: ONE grounded call researches all six fields. At most ONE combined
// follow-up call runs, only for fee fields the first call could not verify. Each field is
// still verified independently from its own grounded evidence.
const MAIN_MAX_QUERIES = 4;
const FOLLOWUP_MAX_QUERIES = 2;
// Retries apply to transient API failures only (those requests are not billed).
// A response with 0 searches or unparseable JSON is billed and is never retried.
const MAX_TRANSIENT_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 1000;
// Hidden "thinking" tokens are billed as output. Measured: 'low' makes the model
// skip Google Search entirely (0 grounded fields) and 'medium' saves nothing, so
// the default leaves the model's own setting untouched.
const THINKING_LEVEL = process.env.GEMINI_THINKING_LEVEL || 'default';

if (!API_KEY) {
  throw new Error('GEMINI_API_KEY environment variable is required');
}

const SHARED_RULES = `Rules:
- ONLY official venue/monument websites, government authorities (ASI, state tourism, DGCA, district admin), reputable news (Times of India, The Hindu, Indian Express)
- NO wedding blogs, travel directories, generic government homepages
- If unverifiable: "unverified" (fees: "unknown")
- "free" ≠ "unknown" for fees; include the exact amount as written by the source`;

const LOCATION_BLOCK = `Location: {location_name}
City: {city_name}
State: {state_name}
Category: {category}`;

const MAIN_PROMPT = `You are a fact-checker for pre-wedding photography locations in India.
YOU MUST USE THE GOOGLE SEARCH TOOL. Do NOT answer from training data.
Search for CURRENT (2024-2026) official information for THIS location.

${LOCATION_BLOCK}

Current database values (reference only):
- pre_wedding_shoot: {current_pre_wedding_shoot}
- pre_wedding_shoot_condition: {current_pre_wedding_shoot_condition}
- prior_booking: {current_prior_booking}
- drone_status: {current_drone_status}
- drone_permission: {current_drone_permission}
- entry_fee: {current_entry_fee}
- shoot_permit_fee: {current_shoot_permit_fee}

Run AT MOST ${MAIN_MAX_QUERIES} Google searches in total, one per topic, no repeats:
1. "{location_name} pre-wedding photography permission booking policy official"
2. "{location_name} drone policy restrictions permission authority"
3. "{location_name} entry fee ticket price Indian nationals official website"
4. "{location_name} professional photography permit fee pre-wedding shoot charges official"

Return ONLY JSON:
{
  "pre_wedding_shoot": "allowed|conditional|prohibited|unverified",
  "pre_wedding_shoot_condition": "string or null",
  "prior_booking": "string",
  "drone_status": "allowed|allowed_with_permission|restricted|prohibited|unverified",
  "drone_permission": "string or null",
  "entry_fee": "string (e.g. '₹40', 'free', 'unknown')",
  "shoot_permit_fee": "string (e.g. '₹750', 'free', 'unknown')",
  "sources": [{"field": "field_name", "url": "https://...", "accessed": "YYYY-MM-DD", "note": "what this source confirms"}],
  "summary": "Brief summary of findings"
}

${SHARED_RULES}
- Dropdown values MUST match: allowed/conditional/prohibited for pre_wedding_shoot; allowed/allowed_with_permission/restricted/prohibited for drone_status
- Drone: identify ACTUAL authority, don't assume DGCA
- If permission required but authority unknown: "Authority unknown - permission required"
- If no special permission: null`;

const FEE_TOPIC = {
  entry_fee: 'ENTRY FEE / ticket price for visitors (Indian nationals)',
  shoot_permit_fee: 'PROFESSIONAL PHOTOGRAPHY / pre-wedding SHOOT PERMIT FEE',
};

// One combined call for every fee field still unverified after the main call.
function followUpPrompt(missingFields) {
  const topics = missingFields.map((f, i) => `${i + 1}. ${FEE_TOPIC[f]}`).join('\n');
  const keys = missingFields.map(f => `  "${f}": "string (e.g. '₹40', 'free', 'unknown')"`).join(',\n');
  return `You are a fact-checker for pre-wedding photography locations in India.
YOU MUST USE THE GOOGLE SEARCH TOOL. Do NOT answer from training data.
An earlier search found no official source for the fee(s) below. Look specifically for the official fee schedule / ticketing / permit page.

${LOCATION_BLOCK}

Fee(s) to find (current, 2024-2026):
${topics}

Run AT MOST ${FOLLOWUP_MAX_QUERIES} Google searches in total, combining both topics if needed.

Return ONLY JSON:
{
${keys},
  "sources": [{"field": "field_name", "url": "https://...", "accessed": "YYYY-MM-DD", "note": "what this source confirms"}],
  "summary": "Brief summary of findings"
}

${SHARED_RULES}`;
}

// Replace every {placeholder}; a function replacer avoids "$&"-style surprises in names.
function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (m, key) => (key in vars ? String(vars[key]) : m));
}

function extractRealUrlFromVertex(vertexUrl) {
  try {
    const url = new URL(vertexUrl);
    const target = url.searchParams.get('url') || url.searchParams.get('uri');
    if (target) return decodeURIComponent(target);
  } catch {}
  return vertexUrl;
}

function extractGroundingMetadata(data) {
  const candidate = data.candidates?.[0];
  if (!candidate?.groundingMetadata) return { queries: [], sources: [] };

  const gm = candidate.groundingMetadata;
  const queries = gm.webSearchQueries || [];
  const chunks = gm.groundingChunks || [];
  const supports = gm.groundingSupports || [];
  const sources = [];

  for (const support of supports) {
    const segment = support.segment;
    const chunkIndices = support.groundingChunkIndices || [];

    for (const idx of chunkIndices) {
      const chunk = chunks[idx];
      if (chunk?.web?.uri && chunk?.web?.title) {
        const url = chunk.web.uri;
        const isRedirect = isVertexRedirect(url);
        const realUrl = isRedirect ? extractRealUrlFromVertex(url) : url;

        sources.push({
          url: realUrl,
          originalUrl: url,
          title: chunk.web.title,
          text: segment?.text || '',
          isOfficial: isOfficialSource(realUrl),
          // Still a redirect if the real URL could not be extracted.
          isRedirect: isRedirect && isVertexRedirect(realUrl),
        });
      }
    }
  }

  return { queries, sources };
}

// Grounding chunks arrive as Google redirect links. Follow the first hop (no
// body fetched) to get the real page URL; keep the redirect flagged if that fails.
async function resolveRedirectSources(sources) {
  const cache = new Map();
  for (const src of sources) {
    if (!src.isRedirect) continue;
    if (!cache.has(src.originalUrl)) {
      let resolved = null;
      try {
        const res = await fetch(src.originalUrl, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(8000) });
        const loc = res.headers.get('location');
        if (loc && /^https?:\/\//i.test(loc) && !isVertexRedirect(loc)) resolved = loc;
      } catch {}
      cache.set(src.originalUrl, resolved);
    }
    const resolved = cache.get(src.originalUrl);
    if (resolved) {
      src.url = resolved;
      src.isRedirect = false;
      src.isOfficial = isOfficialSource(resolved);
    }
  }
  return sources;
}

async function callGenerateContent(prompt) {
  const url = `${BASE_URL}/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: {
      temperature: 0.1,
      topP: 0.8,
      topK: 40,
      maxOutputTokens: 4096,
      ...(THINKING_LEVEL !== 'default' ? { thinkingConfig: { thinkingLevel: THINKING_LEVEL } } : {})
      // No responseMimeType: JSON mode makes the model skip the google_search tool
      // (0 grounding queries). The prompt asks for JSON; parseJSONResponse extracts it.
    }
  };

  const startTime = Date.now();
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const executionTimeMs = Date.now() - startTime;

  const data = await response.json();

  if (!response.ok) {
    const err = new Error(`Gemini API error: ${data.error?.message || `HTTP ${response.status}`}`);
    err.status = response.status;
    throw err;
  }

  return { data, executionTimeMs };
}

function parseJSONResponse(text, defaultValue = {}) {
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    return JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text);
  } catch (e) {
    console.error(`Failed to parse JSON: ${text}`);
    return defaultValue;
  }
}

const realSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// One grounded call. Records ACTUAL usage (tokens from usageMetadata, searches from
// groundingMetadata.webSearchQueries) into the budget after it returns, and checks the
// budget before every request. Retries transient API errors only.
async function runGroundedCall(prompt, maxQueries, label, { callApi, sleep, budget, resolveRedirects }) {
  const usage = { inputTokens: 0, outputTokens: 0, ms: 0, queries: 0, attempts: 0 };

  for (let attempt = 0; ; attempt++) {
    budget?.assertAvailable();
    usage.attempts++;
    let response;
    try {
      response = await callApi(prompt);
    } catch (e) {
      if (attempt < MAX_TRANSIENT_RETRIES && isTransientError(e)) {
        console.log(`  [${label}] transient error: ${e.message}; retry ${attempt + 1}/${MAX_TRANSIENT_RETRIES}`);
        await sleep(RETRY_BASE_DELAY_MS * (attempt + 1));
        continue;
      }
      throw e;
    }

    const { data, executionTimeMs } = response;
    const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('') || '{}';

    // Billed input = prompt + search results fed back to the model;
    // billed output = visible answer + hidden thinking tokens.
    const u = data.usageMetadata;
    const { queries, sources } = extractGroundingMetadata(data);
    usage.inputTokens = (u?.promptTokenCount || 0) + (u?.toolUsePromptTokenCount || 0);
    usage.outputTokens = (u?.candidatesTokenCount || 0) + (u?.thoughtsTokenCount || 0);
    usage.queries = queries.length;
    usage.ms = executionTimeMs;
    budget?.record(usage);

    await resolveRedirects(sources);

    if (queries.length > maxQueries) {
      console.log(`  ⚠ [${label}] grounding queries (${queries.length}) exceeds requested limit of ${maxQueries}`);
    } else {
      console.log(`  [${label}] grounding queries: ${queries.length}`);
    }
    if (queries.length === 0) console.log(`  ⚠ [${label}] model ran no searches; fields stay unverified (not retried: the response is billed).`);

    return {
      label,
      parsed: parseJSONResponse(text),
      queries,
      grounded: sources,
      queryLimitExceeded: queries.length > maxQueries,
      usage,
    };
  }
}

async function verifyLocation(location, options = {}) {
  const { budget = null, callApi = callGenerateContent, sleep = realSleep, resolveRedirects = resolveRedirectSources } = options;
  const pricing = budget?.pricing || getPricing(MODEL_NAME);
  const run = { callApi, sleep, budget, resolveRedirects };
  console.log(`  Starting verification for: ${location.name}`);

  const vars = {
    location_name: location.name,
    city_name: location.city_name,
    state_name: location.state_name,
    category: location.category || 'not specified',
  };
  for (const f of [...FIELD_NAMES, 'pre_wedding_shoot_condition']) {
    vars[`current_${f}`] = location[f] || 'not set';
  }

  // Call 1: all six fields.
  const main = await runGroundedCall(fill(MAIN_PROMPT, vars), MAIN_MAX_QUERIES, 'main', run);
  const calls = [main];

  // Each field is verified on its own evidence.
  const picks = {};
  for (const field of FIELD_NAMES) picks[field] = pickVerifiedField(field, [main]);

  // Call 2 (only if needed): ONE combined follow-up for fee fields still unverified.
  const missingFeeFields = FEE_FIELDS.filter(f => !picks[f].verified);
  let followUp = null;
  let followUpError = null;
  let budgetStopped = false;
  if (missingFeeFields.length > 0) {
    if (budget?.exhausted) {
      budgetStopped = true;
    } else {
      try {
        followUp = await runGroundedCall(fill(followUpPrompt(missingFeeFields), vars), FOLLOWUP_MAX_QUERIES, 'fee-followup', run);
        calls.push(followUp);
        for (const field of missingFeeFields) picks[field] = pickVerifiedField(field, [followUp]);
      } catch (e) {
        if (e instanceof BudgetExceededError) budgetStopped = true;
        else followUpError = e.message;
        console.log(`  ⚠ fee follow-up not completed: ${e.message}`);
      }
    }
  }

  const usage = calls.reduce((acc, c) => ({
    inputTokens: acc.inputTokens + c.usage.inputTokens,
    outputTokens: acc.outputTokens + c.usage.outputTokens,
    ms: acc.ms + c.usage.ms,
    queries: acc.queries + c.usage.queries,
    attempts: acc.attempts + c.usage.attempts,
  }), { inputTokens: 0, outputTokens: 0, ms: 0, queries: 0, attempts: 0 });
  const costs = calculateCost(usage, pricing);

  const fieldVerified = {};
  const fieldEvidence = {};
  const proposed = {};
  for (const field of FIELD_NAMES) {
    fieldVerified[field] = picks[field].verified;
    fieldEvidence[field] = picks[field].evidence;
    proposed[field] = picks[field].verified ? picks[field].value : null;
  }
  fieldVerified.pre_wedding_shoot_condition = fieldVerified.pre_wedding_shoot;
  const groundedFieldCount = FIELD_NAMES.filter(f => fieldVerified[f]).length;

  // Stored sources: only real http(s) pages on official/reputable domains. Redirects,
  // images and unknown sites are dropped; model-written sources must match a grounded URL.
  const rawGrounded = calls.flatMap(c => c.grounded);
  const rawModel = calls.flatMap(c => (Array.isArray(c.parsed.sources) ? c.parsed.sources : []));
  const kept = filterSources(rawGrounded, rawModel);
  const today = new Date().toISOString().split('T')[0];
  const allSources = [
    ...kept.model.map(s => ({ field: s.field, url: s.url, accessed: s.accessed, note: s.note })),
    ...kept.grounded.map(s => ({ field: 'grounded', url: s.url, accessed: today, note: s.title, text: s.text, isOfficial: s.isOfficial })),
  ];
  const officialSourceCount = allSources.filter(s => isOfficialSource(s.url)).length;

  return {
    pre_wedding_shoot: proposed.pre_wedding_shoot || 'unverified',
    pre_wedding_shoot_condition: fieldVerified.pre_wedding_shoot ? main.parsed.pre_wedding_shoot_condition ?? null : null,
    prior_booking: proposed.prior_booking || 'Unknown',
    drone_status: proposed.drone_status || 'unverified',
    drone_permission: proposed.drone_permission,
    entry_fee: proposed.entry_fee || 'unknown',
    shoot_permit_fee: proposed.shoot_permit_fee || 'unknown',
    sources: allSources,
    fieldVerified,  // which fields have grounded evidence
    fieldEvidence,  // field -> grounded sources (url/title/supported text) backing it
    groundedFieldCount,
    confidence: computeConfidence(fieldVerified, fieldEvidence),
    summary: main.parsed.summary || `${usage.queries} grounding queries, ${groundedFieldCount}/${FIELD_NAMES.length} fields grounded.`,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    attempts: usage.attempts,
    apiCalls: calls.length,
    followUpRan: followUp !== null,
    missingFeeFields,
    followUpError,
    budgetStopped,
    groundingQueries: usage.queries,
    groundingSourcesCount: allSources.length,
    officialSourceCount,
    hasVerifiedSources: groundedFieldCount > 0,
    queryLimitExceeded: calls.some(c => c.queryLimitExceeded),
    vertexRedirectsFiltered: rawGrounded.filter(s => s.isRedirect).length,
    sourcesFiltered: rawGrounded.length + rawModel.length - allSources.length,
    costBreakdownUsd: { input: costs.inputCostUsd, output: costs.outputCostUsd, grounding: costs.groundingCostUsd },
    estimatedCostUsd: costs.totalCostUsd,
    estimatedCostInr: costs.totalCostInr,
    executionTimeMs: usage.ms,
    model: MODEL_NAME,
    // Full per-call trail for manual review: every search query and every returned URL
    // with its keep/drop decision.
    audit: calls.map(call => ({
      call: call.label,
      groundingQueries: call.queries,
      tokens: { input: call.usage.inputTokens, output: call.usage.outputTokens },
      attempts: call.usage.attempts,
      returnedSources: call.grounded.map(s => {
        const reason = s.isRedirect ? 'redirect' : sourceRejectionReason(s.url);
        return { url: s.url, originalUrl: s.originalUrl, title: s.title, supportedText: s.text, kept: reason === null, dropReason: reason };
      }),
      modelSources: (Array.isArray(call.parsed.sources) ? call.parsed.sources : []).map(s => ({
        url: s?.url, field: s?.field, kept: kept.model.includes(s),
      })),
    })),
  };
}

// Planning ceiling for ONE location (main call + one follow-up), using the requested
// search limits and generous token assumptions. Real spend is metered per response.
const WORST_CASE_INPUT_TOKENS_PER_CALL = 15000;
const WORST_CASE_OUTPUT_TOKENS_PER_CALL = 8000;
function estimateWorstCaseCostPerLocation() {
  const calls = 2;
  return calculateCost({
    inputTokens: WORST_CASE_INPUT_TOKENS_PER_CALL * calls,
    outputTokens: WORST_CASE_OUTPUT_TOKENS_PER_CALL * calls,
    queries: MAIN_MAX_QUERIES + FOLLOWUP_MAX_QUERIES,
  }, getPricing(MODEL_NAME));
}

module.exports = { verifyLocation, MODEL_NAME, estimateWorstCaseCostPerLocation };
