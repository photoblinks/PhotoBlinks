// Gemini 3.1 Flash-Lite call: NO tools, NO Google Search grounding. The model only reads the
// source excerpts we fetched and must return verbatim quotes. No retries (every call bills).
const { FIELD_NAMES } = require('./fields');
const cfg = require('./config');

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

function buildPrompt(location, sources) {
  const blocks = sources.map((s, i) => `### SOURCE ${i + 1}\nURL: ${s.url}\n${s.excerpt}`).join('\n\n');
  return `You extract facts about a pre-wedding photography location in India from the SOURCES below.
Use ONLY the text in the SOURCES. Do not use outside knowledge. Do not guess.

Location: ${location.name}, ${location.city_name}, ${location.state_name}

Fields:
- pre_wedding_shoot: one of allowed | conditional | prohibited | unverified
- prior_booking: short text (booking / advance permission required?) or "unknown"
- drone_status: one of allowed | allowed_with_permission | restricted | prohibited | unverified
- drone_permission: authority/permission text, or null
- entry_fee: exact amount as written (e.g. "₹40"), "free", or "unknown"
- shoot_permit_fee: exact amount as written for professional / pre-wedding photography, "free", or "unknown"

For EVERY field return {"value", "quote", "source_url"}:
- "quote": text copied EXACTLY, character for character, from ONE source (12-300 characters). It must state the fact.
- "source_url": the URL of the source that contains the quote.
- For prior_booking and drone_permission, "value" MUST be copied EXACTLY from its quote: ONE contiguous run of the quote's own words, with nothing paraphrased, reordered, added or removed in the middle. Keep any "not / no / without" and any "only / unless / except / if" wording that belongs to that run. If no contiguous run states the fact, use "unverified" (drone_permission: null).
- For every other field, "value" must be directly supported by the quote and add nothing the quote does not say (no extra authorities, zones, documents or details).
- Quotes for every field except the two fees MUST be in English; ignore non-English sources.
- Only use sources that describe CURRENT rules. Ignore articles that are old or undated for permission, drone or booking conditions.
- If the sources do not state the fact: value "unverified" (fees: "unknown", drone_permission: null), quote null, source_url null.

Return ONLY JSON:
{"fields": {${FIELD_NAMES.map(f => `"${f}": {"value": ..., "quote": ..., "source_url": ...}`).join(', ')}}, "summary": "one sentence"}

${blocks}`;
}

async function callGemini(prompt, { apiKey, fetchImpl = fetch, signal }) {
  const res = await fetchImpl(`${BASE_URL}/models/${cfg.MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    redirect: 'error', // never forward the API key header to another host
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      // No "tools" key: grounding is never enabled.
      generationConfig: { temperature: 0, maxOutputTokens: cfg.MAX_OUTPUT_TOKENS, responseMimeType: 'application/json' },
    }),
    signal: AbortSignal.any([AbortSignal.timeout(cfg.LLM_TIMEOUT_MS), ...(signal ? [signal] : [])]),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(`Gemini API error: ${data.error?.message || `HTTP ${res.status}`}`);
    err.status = res.status;
    throw err;
  }
  const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  const u = data.usageMetadata || {};
  return {
    text,
    usage: {
      inputTokens: (u.promptTokenCount || 0) + (u.toolUsePromptTokenCount || 0),
      outputTokens: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0),
    },
    finishReason: data.candidates?.[0]?.finishReason || null,
  };
}

function parseModelJson(text) {
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    const parsed = JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text);
    return parsed && typeof parsed === 'object' && parsed.fields && typeof parsed.fields === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

module.exports = { buildPrompt, callGemini, parseModelJson };
