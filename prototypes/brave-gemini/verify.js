// Field verification against the REAL fetched page text (not the model's own words).
// A field is verified only if: the source URL is one we fetched, the quote appears verbatim
// in that page, the quote is about that field, the value is valid, and (fees) every amount
// in the value appears as a whole number in the quote.
const { FIELD_NAMES, FEE_FIELDS, ENUMS, quoteMatchesFieldTopic, isUnknownValue, computeConfidence } = require('./fields');
const { valueSupportedByQuote } = require('./value-support');
const { assessFreshness } = require('./freshness');
const { isEnglishEvidence } = require('./language');
const cfg = require('./config');

// Canonical form used on BOTH sides of the quote match: case, quotes, dashes, currency, spacing.
function normalizeText(s) {
  return String(s)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/(\d),(?=\d)/g, '$1')
    .replace(/₹|\brs\.?(?=\s*\d)|\binr\b/g, 'rs')
    .replace(/rs\s+(?=\d)/g, 'rs')
    .replace(/\s+/g, ' ')
    .trim();
}

function quoteInPage(quote, pageText) {
  const q = normalizeText(quote);
  return q.length > 0 && normalizeText(pageText).includes(q);
}

// Whole-number match: "40" does NOT match inside "400" or "4.0" or "2040".
function amountInText(amount, text) {
  const n = String(amount).replace(/,/g, '');
  const re = new RegExp(`(?<![\\d.])${n.replace(/\./g, '\\.')}(?![\\d]|\\.\\d)`);
  return re.test(String(text).replace(/(\d),(?=\d)/g, '$1'));
}

const FREE_RE = /\b(free|no fee|no charge|nil|without charge)\b/i;

function feeValueSupported(value, quote) {
  const amounts = String(value).replace(/,/g, '').match(/\d+(?:\.\d+)?/g);
  if (amounts) return amounts.every(a => amountInText(a, quote));
  return FREE_RE.test(String(value)) && FREE_RE.test(quote);
}

const GENERIC_NAME_WORDS = new Set([
  'site', 'heritage', 'grounds', 'gardens', 'garden', 'plantation', 'coffee', 'tea', 'park', 'beach', 'fort',
  'palace', 'temple', 'falls', 'hill', 'hills', 'lake', 'view', 'point', 'the', 'and',
]);

// Cheap wrong-place guard: the page must mention a distinctive word of the location name.
function pageMentionsLocation(pageText, location) {
  const words = `${location.name} ${location.city_name}`
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(w => w.length >= 4 && !GENERIC_NAME_WORDS.has(w));
  const text = pageText.toLowerCase();
  return words.some(w => text.includes(w));
}

// pages: [{ url, text, tier }] = full text of the pages sent to the model (tier: official | news).
// Fee fields may only be verified from OFFICIAL pages; news can support permission/drone fields.
// News is evidence of CURRENT conditions only: undated or older-than-NEWS_MAX_AGE_DAYS news is
// rejected for every field (page.published = ISO date or null; `now` is injectable for tests).
function verifyFields(location, modelFields, pages, { now = new Date() } = {}) {
  const byUrl = new Map(pages.map(p => [p.url, p]));
  const fieldVerified = {};
  const fieldEvidence = {};
  const proposed = {};
  const results = {};

  for (const field of FIELD_NAMES) {
    const f = modelFields?.[field];
    const fail = reason => {
      fieldVerified[field] = false;
      fieldEvidence[field] = [];
      proposed[field] = null;
      // `value` is the proposed value (null unless verified); `model_value` is only an audit trail.
      results[field] = { verified: false, reason, value: null, model_value: f?.value ?? null, quote: f?.quote ?? null, source_url: f?.source_url ?? null };
    };

    if (!f || typeof f !== 'object') { fail(modelFields ? 'missing_field' : 'no_model_output'); continue; }
    const { value, quote, source_url } = f;
    if (isUnknownValue(value)) { fail('unknown_value'); continue; }
    if (typeof quote !== 'string' || quote.length < cfg.MIN_QUOTE_CHARS || quote.length > cfg.MAX_QUOTE_CHARS) { fail('bad_quote'); continue; }
    const page = typeof source_url === 'string' ? byUrl.get(source_url) : undefined;
    if (!page) { fail('source_not_fetched'); continue; }
    if (page.tier === 'news') {
      const freshness = assessFreshness(page.published ?? null, now, cfg.NEWS_MAX_AGE_DAYS);
      if (!freshness.fresh) { fail(freshness.reason); continue; }
    }
    if (!pageMentionsLocation(page.text, location)) { fail('page_not_about_location'); continue; }
    if (!quoteInPage(quote, page.text)) { fail('quote_not_in_page'); continue; }
    // The negation / qualifier / wording checks for every non-fee field understand English only,
    // so non-English evidence is rejected before any of them runs.
    if (!FEE_FIELDS.includes(field) && !isEnglishEvidence(quote).ok) { fail('non_english_evidence'); continue; }
    if (ENUMS[field] && !ENUMS[field].includes(value)) { fail('invalid_enum'); continue; }
    if (typeof value !== 'string') { fail('invalid_value'); continue; }
    if (FEE_FIELDS.includes(field) && page.tier !== 'official') { fail('fee_requires_official_source'); continue; }

    // Topic check on the QUOTE text. Source trust was already enforced by the source policy.
    if (!quoteMatchesFieldTopic(field, quote, { official: page.tier === 'official' })) { fail('quote_off_topic'); continue; }
    if (FEE_FIELDS.includes(field) && !feeValueSupported(value, quote)) { fail('amount_not_in_quote'); continue; }
    // Non-fee values must be stated by the exact quote: no unsupported additions.
    if (!FEE_FIELDS.includes(field)) {
      const support = valueSupportedByQuote(field, value, quote);
      if (!support.ok) { fail(support.reason); continue; }
    }

    fieldVerified[field] = true;
    fieldEvidence[field] = [{ url: page.url, tier: page.tier ?? null }];
    proposed[field] = value;
    results[field] = { verified: true, reason: null, value, model_value: value, quote, source_url: page.url, tier: page.tier ?? null };
  }

  return { fieldVerified, fieldEvidence, proposed, results, confidence: computeConfidence(fieldVerified, fieldEvidence) };
}

module.exports = { verifyFields, normalizeText, quoteInPage, amountInText, feeValueSupported, pageMentionsLocation };
