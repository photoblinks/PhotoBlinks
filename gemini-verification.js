// Pure helpers for gemini-client.js (no API key, no network) so they can be unit tested.

const FIELD_NAMES = ['pre_wedding_shoot', 'drone_status', 'prior_booking', 'drone_permission', 'entry_fee', 'shoot_permit_fee'];
// Each fee field gets its own independent grounded search. shoot_permit_fee is the
// professional-photography charge (the DB has no separate photography_fee column).
const FEE_FIELDS = ['entry_fee', 'shoot_permit_fee'];
const ENUMS = {
  pre_wedding_shoot: ['allowed', 'conditional', 'prohibited'],
  drone_status: ['allowed', 'allowed_with_permission', 'restricted', 'prohibited'],
};
const MAX_CONFIDENCE = 0.95;

const OFFICIAL_DOMAINS = [
  'asi.nic.in', 'asi.gov.in', 'sahmat.asi.gov.in',
  'digitalsky.dgca.gov.in', 'dgca.gov.in',
  'keralatourism.org', 'karnatakatourism.org', 'incredibleindia.org',
  'tourism.gov.in', 'mha.gov.in',
  'nic.in', 'gov.in',
];

// Reputable news the prompt allows. Blogs, travel directories and video sites
// are never accepted as evidence.
const REPUTABLE_NEWS_DOMAINS = [
  'thehindu.com', 'timesofindia.indiatimes.com', 'indiatimes.com', 'indianexpress.com',
  'newindianexpress.com', 'hindustantimes.com', 'deccanherald.com', 'ndtv.com',
  'indiatvnews.com', 'livelaw.in', 'thehindubusinessline.com',
];

const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|svg|avif|bmp|ico|tiff?)$/i;

function parseHttpUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

function hostMatches(url, domains) {
  const u = parseHttpUrl(url);
  if (!u) return false;
  const host = u.hostname.replace(/^www\./, '');
  return domains.some(d => host === d || host.endsWith('.' + d));
}

const isOfficialSource = url => hostMatches(url, OFFICIAL_DOMAINS);
const isTrustedSource = url => isOfficialSource(url) || hostMatches(url, REPUTABLE_NEWS_DOMAINS);

function isVertexRedirect(url) {
  const u = parseHttpUrl(url);
  return !!u && u.hostname === 'vertexaisearch.cloud.google.com' && u.pathname.startsWith('/grounding-api-redirect/');
}

function isImageUrl(url) {
  const u = parseHttpUrl(url);
  return !!u && IMAGE_EXT_RE.test(u.pathname);
}

// A source URL may be stored/used as evidence only if it is a real http(s) page on
// an official or reputable-news domain: no search redirects, no images, no unknown sites.
function isUsableSource(url) {
  return typeof url === 'string' && !!parseHttpUrl(url) && !isVertexRedirect(url) && !isImageUrl(url) && isTrustedSource(url);
}

// Why a URL is not usable as a source (null when it is). For audit logs.
function sourceRejectionReason(url) {
  if (typeof url !== 'string' || !parseHttpUrl(url)) return 'invalid_url';
  if (isVertexRedirect(url)) return 'redirect';
  if (isImageUrl(url)) return 'image';
  if (!isTrustedSource(url)) return 'untrusted_domain';
  return null;
}

// Per-field topic matchers applied to the text segment a grounded source supports.
const FIELD_TOPIC_MATCHERS = {
  pre_wedding_shoot: t => t.includes('pre-wedding') || t.includes('pre wedding') || t.includes('photoshoot') || t.includes('photography permission'),
  drone_status: t => t.includes('drone') || t.includes('no-fly') || t.includes('red zone') || t.includes('digital sky'),
  drone_permission: t => t.includes('drone') && (t.includes('permission') || t.includes('authority') || t.includes('clearance') || t.includes('noc') || t.includes('dgca') || t.includes('digital sky')),
  prior_booking: t => t.includes('booking') || t.includes('advance') || t.includes('prior permission') || t.includes('prior approval') || t.includes('application'),
  entry_fee: t => t.includes('entry fee') || t.includes('ticket') || t.includes('admission') || t.includes('entrance') || t.includes('entry charge') || t.includes('free entry'),
  shoot_permit_fee: t => t.includes('permit fee') || t.includes('shoot fee') || t.includes('photography charge') || t.includes('photography fee') || t.includes('professional shoot') || t.includes('filming fee'),
};

// The supported segment is usually one line of the model's JSON answer
// (`"entry_fee": "..."`). If it names a field key, it counts for THAT field only;
// free text (e.g. the summary) falls back to the topic matchers.
const SEGMENT_KEY_TO_FIELD = {
  pre_wedding_shoot: 'pre_wedding_shoot',
  pre_wedding_shoot_condition: 'pre_wedding_shoot',
  prior_booking: 'prior_booking',
  drone_status: 'drone_status',
  drone_permission: 'drone_permission',
  entry_fee: 'entry_fee',
  shoot_permit_fee: 'shoot_permit_fee',
};

// Evidence = grounded search results (never model-written URLs) that are usable
// sources and whose supported text is about THIS field.
function groundedSourcesForField(fieldName, groundedSources) {
  const matches = FIELD_TOPIC_MATCHERS[fieldName];
  return groundedSources.filter(src => {
    if (src.isRedirect || !src.text || !isUsableSource(src.url)) return false;
    const keyed = src.text.match(/^\s*"?([a-z_]+)"?\s*:/i);
    const keyField = keyed && SEGMENT_KEY_TO_FIELD[keyed[1].toLowerCase()];
    if (keyField) return keyField === fieldName;
    return matches(src.text.toLowerCase());
  });
}

function isUnknownValue(value) {
  if (value === null || value === undefined) return true;
  const v = String(value).trim().toLowerCase();
  return v === '' || v === 'unknown' || v === 'unverified' || v === 'null' || v === 'n/a';
}

// Fee fields: the supporting text must actually contain the proposed amount
// (or say "free"); "unknown" is never treated as free or zero.
function supportsFeeValue(value, sources) {
  const text = sources.map(s => s.text.toLowerCase().replace(/,/g, '')).join(' ');
  const amounts = String(value).replace(/,/g, '').match(/\d+(\.\d+)?/g);
  if (amounts) return amounts.some(a => text.includes(a));
  if (/(free|no fee|no charge|nil)/i.test(String(value))) return /(free|no fee|no charge|nil)/.test(text);
  return false;
}

function isFieldVerified(field, value, support) {
  if (support.length === 0 || isUnknownValue(value)) return false;
  if (ENUMS[field] && !ENUMS[field].includes(value)) return false;
  if (FEE_FIELDS.includes(field)) return supportsFeeValue(value, support);
  return true;
}

// First candidate call (in order) that independently verifies THIS field wins; its value
// and its own grounded evidence are used. candidates = [{ parsed, grounded }].
function pickVerifiedField(field, candidates) {
  for (let i = 0; i < candidates.length; i++) {
    const { parsed, grounded } = candidates[i];
    const value = parsed?.[field];
    const support = groundedSourcesForField(field, grounded || []);
    if (isFieldVerified(field, value, support)) return { verified: true, value, evidence: support, callIndex: i };
  }
  return { verified: false, value: null, evidence: [], callIndex: -1 };
}

// Only transient failures are worth a retry: rate limit / server errors / network.
// A failed request is not billed; a successful-but-poor answer (0 searches, bad JSON) is,
// so it is never retried.
const TRANSIENT_STATUSES = [429, 500, 502, 503, 504];
function isTransientError(e) {
  if (!e) return false;
  if (typeof e.status === 'number') return TRANSIENT_STATUSES.includes(e.status);
  return e.name === 'TimeoutError' || e.name === 'AbortError' || e.name === 'TypeError' || ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN'].includes(e.code);
}

// Confidence comes ONLY from verified fields: each contributes 1.0 (official
// source) or 0.8 (reputable news) out of the six fields; unverified fields add 0.
function computeConfidence(fieldVerified, fieldEvidence) {
  let score = 0;
  for (const field of FIELD_NAMES) {
    if (!fieldVerified[field]) continue;
    const evidence = fieldEvidence[field] || [];
    score += evidence.some(s => isOfficialSource(s.url)) ? 1 : 0.8;
  }
  return Math.min(MAX_CONFIDENCE, Math.round((score / FIELD_NAMES.length) * 100) / 100);
}

// Keep only usable sources. Model-written sources must also match a grounded URL.
function filterSources(groundedSources, modelSources = []) {
  const grounded = groundedSources.filter(s => !s.isRedirect && isUsableSource(s.url));
  const groundedUrls = new Set(grounded.map(s => s.url));
  const model = modelSources.filter(s => s && isUsableSource(s.url) && groundedUrls.has(s.url));
  return { grounded, model };
}

module.exports = {
  FIELD_NAMES, FEE_FIELDS, ENUMS,
  isOfficialSource, isTrustedSource, isVertexRedirect, isImageUrl, isUsableSource, sourceRejectionReason,
  groundedSourcesForField, isUnknownValue, supportsFeeValue, isFieldVerified,
  pickVerifiedField, isTransientError,
  computeConfidence, filterSources,
};
