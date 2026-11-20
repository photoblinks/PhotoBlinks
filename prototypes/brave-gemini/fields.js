// The six fields and their rules, owned by the prototype so it has NO dependency on the legacy
// Gemini-grounding pipeline (gemini-client.js / gemini-verification.js). Keep in step with the
// DB check constraint only by hand: nothing here reads or writes the database.
const FIELD_NAMES = Object.freeze(['pre_wedding_shoot', 'drone_status', 'prior_booking', 'drone_permission', 'entry_fee', 'shoot_permit_fee']);
const FEE_FIELDS = Object.freeze(['entry_fee', 'shoot_permit_fee']);
const ENUMS = Object.freeze({
  pre_wedding_shoot: Object.freeze(['allowed', 'conditional', 'prohibited']),
  drone_status: Object.freeze(['allowed', 'allowed_with_permission', 'restricted', 'prohibited']),
});
const MAX_CONFIDENCE = 0.95;

// Is the verbatim QUOTE about this field? (The quote, not the model's answer.)
const TOPIC = {
  pre_wedding_shoot: t => t.includes('pre-wedding') || t.includes('pre wedding') || t.includes('photoshoot') || t.includes('photography permission'),
  drone_status: t => t.includes('drone') || t.includes('no-fly') || t.includes('red zone') || t.includes('digital sky'),
  drone_permission: t => t.includes('drone') && (t.includes('permission') || t.includes('authority') || t.includes('clearance') || t.includes('noc') || t.includes('dgca') || t.includes('digital sky')),
  prior_booking: t => t.includes('booking') || t.includes('advance') || t.includes('prior permission') || t.includes('prior approval') || t.includes('application'),
  entry_fee: t => t.includes('entry fee') || t.includes('ticket') || t.includes('admission') || t.includes('entrance') || t.includes('entry charge') || t.includes('free entry'),
  shoot_permit_fee: t => t.includes('permit fee') || t.includes('shoot fee') || t.includes('photography charge') || t.includes('photography fee') || t.includes('professional shoot') || t.includes('filming fee'),
};

// An official page often states the admission price as "₹240 for Indian adults and ₹460 for
// foreign tourists" without the words "entry fee" or "ticket". Accept that for entry_fee only,
// when the quote has a rupee amount AND visitor context AND nothing that marks a different
// charge (parking, hotel, camera, permit, ...). Never applied to other fields.
const RUPEE_AMOUNT = /(?:₹|\brs\.?|\binr)\s*\d/i;
const VISITOR_CONTEXT = /\b(adults?|tourists?|visitors?|foreigners?|indians?|nationals?|children|child|students?|senior citizens?|per person|per head)\b/i;
const OTHER_CHARGE_CONTEXT = /\b(parking|hotel|rooms?|stay|accommodation|rent(?:al)?|food|meals?|camera|video|photograph\w*|drone|permit|shoot|filming|guide|donation)\b/i;

function looksLikeVisitorAdmissionFee(quote) {
  return RUPEE_AMOUNT.test(quote) && VISITOR_CONTEXT.test(quote) && !OTHER_CHARGE_CONTEXT.test(quote);
}

// options.official: the quote comes from an OFFICIAL page (the relaxed entry_fee rule needs it).
function quoteMatchesFieldTopic(field, quote, { official = false } = {}) {
  const matches = TOPIC[field];
  if (!matches) return false;
  const text = String(quote);
  if (matches(text.toLowerCase())) return true;
  return field === 'entry_fee' && official && looksLikeVisitorAdmissionFee(text);
}

function isUnknownValue(value) {
  if (value === null || value === undefined) return true;
  const v = String(value).trim().toLowerCase();
  return v === '' || v === 'unknown' || v === 'unverified' || v === 'null' || v === 'n/a';
}

// Confidence comes ONLY from verified fields: each contributes 1.0 (official source) or 0.8
// (reputable news) out of the six; unverified fields add 0. evidence entries: { url, tier }.
function computeConfidence(fieldVerified, fieldEvidence) {
  let score = 0;
  for (const field of FIELD_NAMES) {
    if (!fieldVerified[field]) continue;
    score += (fieldEvidence[field] || []).some(e => e.tier === 'official') ? 1 : 0.8;
  }
  return Math.min(MAX_CONFIDENCE, Math.round((score / FIELD_NAMES.length) * 100) / 100);
}

module.exports = { FIELD_NAMES, FEE_FIELDS, ENUMS, quoteMatchesFieldTopic, isUnknownValue, computeConfidence };
