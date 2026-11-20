// Is a NON-fee field value directly supported by its exact quote? Fail-closed: when the quote
// does not clearly state the value, the field is rejected, never "probably right".
//
//   enum fields (pre_wedding_shoot, drone_status): the quote must contain wording that states that
//     specific value. Key words only count when NOT negated; a "requirement" is a permission word
//     and a requirement word (or a requirement phrase such as "after obtaining clearance") in the
//     same un-negated clause.
//   free-text fields (prior_booking, drone_permission), by cfg.FREE_TEXT_MODE:
//     'excerpt' (default): the value must be an exact contiguous piece of the quote.
//     'paraphrase': every word of the value must match a quote word (inflections, curated synonyms,
//        US/UK spelling, number words and approved acronyms), numbers exactly.
//   Both free-text modes keep every safety rule: negation presence AND scope, and qualifiers
//   (only / unless / except / ...) that are attached to the value's words must be kept.
// Fee fields are checked separately (exact amounts) in verify.js.
const { ENUMS } = require('./fields');
const cfg = require('./config');

const NEG_WINDOW = 3; // a negation covers the next 3 words in its clause

const NEGATIONS = new Set(['no', 'not', 'without', 'never', 'cannot', 'non', 'nor', 'neither', 'none', 'nothing', 'nowhere', 'nobody', 'unable']);
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'at', 'by', 'is', 'are', 'be', 'been', 'from',
  'with', 'as', 'it', 'its', 'this', 'that', 'these', 'those', 'can', 'may', 'will', 'shall', 'also', 'any', 'all', 'per',
]);
// A qualifier that limits or conditions a statement must be kept by the value when it is attached
// to the words the value covers (same sentence, within cfg.QUALIFIER_DISTANCE words).
// ("otherwise" is deliberately not here: it introduces a consequence, not a limit.)
const QUALIFIERS = new Set([
  'only', 'unless', 'except', 'excepting', 'excluding', 'if', 'provided',
  'foreign', 'foreigner', 'foreigners', 'commercial', 'professional',
]);

// ------------------------------------------------------------------ normalisation (Unicode-aware)

const LETTERS = '\\p{L}\\p{N}';
const wordRe = src => new RegExp(`(?<![${LETTERS}])(?:${src})(?![${LETTERS}])`, 'u');
const globalOf = re => new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
const wordsOf = s => s.match(/[\p{L}\p{N}]+/gu) || [];

// US/UK spelling: one fixed table, applied to BOTH sides of every comparison.
const SPELLING = {
  authorisation: 'authorization', authorisations: 'authorizations', authorise: 'authorize', authorised: 'authorized',
  authorising: 'authorizing', licence: 'license', licences: 'licenses', licenced: 'licensed', organisation: 'organization',
  organisations: 'organizations', organise: 'organize', organised: 'organized', recognise: 'recognize', recognised: 'recognized',
  centre: 'center', centres: 'centers', metre: 'meter', metres: 'meters', kilometre: 'kilometer', kilometres: 'kilometers',
  colour: 'color', colours: 'colors', programme: 'program', programmes: 'programs', favour: 'favor', grey: 'gray',
};
const SPELLING_RE = new RegExp(`(?<![${LETTERS}])(${Object.keys(SPELLING).join('|')})(?![${LETTERS}])`, 'gu');

// Approved acronyms ONLY. The long form collapses to the acronym on both sides, so the "no" in
// "no objection certificate" is never read as a negation.
const ACRONYMS = [
  [/archaeological survey of india/g, 'asi'],
  [/archeological survey of india/g, 'asi'],
  [/directorate[- ]general of civil aviation/g, 'dgca'],
  [/no[- ]objection certificate/g, 'noc'],
];

// canonical=false (excerpt mode) skips spelling/acronym folding so an "exact" excerpt stays exact.
function normalize(s, canonical = true) {
  let t = String(s)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/(?<![\p{L}])can't(?![\p{L}])/gu, 'cannot')
    .replace(/(?<![\p{L}])won't(?![\p{L}])/gu, 'will not')
    .replace(/(?<![\p{L}])shan't(?![\p{L}])/gu, 'shall not')
    .replace(/(?<![\p{L}])ain't(?![\p{L}])/gu, 'is not')
    .replace(/(?<![\p{L}])(\p{L}+)n't(?![\p{L}])/gu, '$1 not');
  if (canonical) {
    t = t.replace(SPELLING_RE, (m, w) => SPELLING[w]);
    for (const [re, acronym] of ACRONYMS) t = t.replace(re, acronym);
  }
  return t;
}

const SENTENCE_SPLIT = /[.!?;\n]+/;
const CLAUSE_SPLIT = /[,:()]+/;
const clausesOf = (text, canonical = true) => normalize(text, canonical).split(/[,;:.!?()\n]+/).map(c => c.trim()).filter(Boolean);

// Number words -> digits so "fifteen" and "15" compare equal ("twenty five" -> 25).
const UNITS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
function mergeNumberWords(words) {
  const out = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w in TENS) {
      const next = words[i + 1];
      if (next in UNITS && UNITS[next] >= 1 && UNITS[next] <= 9) { out.push(String(TENS[w] + UNITS[next])); i++; } else out.push(String(TENS[w]));
    } else if (w in UNITS) out.push(String(UNITS[w]));
    else out.push(w);
  }
  return out;
}

// Tokens with sentence/position and negation status ("negated" = within 3 words after a
// negation, same clause; negAt = index of that negation token).
function analyse(text, canonical = true) {
  const items = [];
  let clauseId = 0;
  normalize(text, canonical).split(SENTENCE_SPLIT).forEach((sentence, sent) => {
    let pos = 0;
    for (const clauseText of sentence.split(CLAUSE_SPLIT)) {
      const clause = clauseId++;
      const words = canonical ? mergeNumberWords(wordsOf(clauseText)) : wordsOf(clauseText);
      let lastNeg = -Infinity;
      let lastNegIdx = -1;
      words.forEach((w, i) => {
        const base = { w, sent, clause, clauseStart: i === 0, pos: pos + i };
        if (NEGATIONS.has(w)) {
          lastNeg = i;
          lastNegIdx = items.length;
          items.push({ ...base, negation: true, negated: false, negAt: -1 });
        } else {
          const negated = i - lastNeg <= NEG_WINDOW;
          items.push({ ...base, negation: false, negated, negAt: negated ? lastNegIdx : -1 });
        }
      });
      pos += words.length;
    }
  });
  return items;
}

// ------------------------------------------------------------------ safe word matching (paraphrase mode)

const SYNONYM_GROUPS = {
  timing: ['prior', 'advance', 'beforehand'],
  obligation: ['required', 'require', 'requires', 'requirement', 'requirements', 'mandatory', 'compulsory', 'necessary', 'need', 'needs', 'needed', 'must', 'obligatory'],
  approval: ['permission', 'permissions', 'permit', 'permits', 'approval', 'approvals', 'clearance', 'clearances', 'authorization', 'authorizations', 'consent', 'noc'],
  booking: ['booking', 'bookings', 'book', 'books', 'booked', 'reservation', 'reservations', 'reserve', 'reserved'],
  photography: ['photograph', 'photographs', 'photography'],
};
// Members only (never inflections like "permitted"): "permitted" means allowed, not "permission".
const SYNONYM_INDEX = new Map(Object.entries(SYNONYM_GROUPS).flatMap(([head, members]) => members.map(m => [m, head])));

const DOUBLING = /(tt|nn|pp|bb|gg|mm|rr|dd)$/;
const undouble = c => (DOUBLING.test(c) ? c.slice(0, -1) : c);

// Candidate stems for an ASCII word. Two words match when their candidate sets intersect.
function stemCandidates(w) {
  const out = new Set([w]);
  if (w.length < 4) return out;
  const add = c => { if (c.length >= 3) { out.add(c); out.add(undouble(c)); } };
  if (w.endsWith('ies')) add(`${w.slice(0, -3)}y`);
  if (w.endsWith('es')) add(w.slice(0, -2));
  if (w.endsWith('s') && !w.endsWith('ss')) add(w.slice(0, -1));
  if (w.endsWith('ed')) { add(w.slice(0, -2)); add(w.slice(0, -1)); }
  if (w.endsWith('ing')) { add(w.slice(0, -3)); add(`${w.slice(0, -3)}e`); }
  return out;
}

const keyCache = new Map();
function keysOf(w) {
  if (keyCache.has(w)) return keyCache.get(w);
  let keys;
  if (/\d/.test(w)) keys = new Set([w]); // numbers: exact only
  else if (/^[a-z]+$/.test(w)) {
    keys = stemCandidates(w);
    const head = SYNONYM_INDEX.get(w);
    if (head) keys.add(`~${head}`);
  } else keys = new Set([w]); // non-ASCII letters: exact only
  keyCache.set(w, keys);
  return keys;
}
const wordsMatch = (a, b) => { const kb = keysOf(b); return [...keysOf(a)].some(k => kb.has(k)); };

// Audience words describe WHO a rule covers; they only attach within the value's own clause.
const AUDIENCE = new Set(['foreign', 'foreigner', 'foreigners', 'commercial', 'professional']);

// Qualifiers in the quote that are attached to the words the value covers, and missing from it.
//   attached = same sentence and either within cfg.QUALIFIER_DISTANCE words of the covered span,
//   or (conditional words only) the opening word of the clause right before / after it
//   ("If you use a tripod, permission is required." / "Permission is required, unless ...").
//   Audience words (foreign / commercial / professional) must also be in the value's own clause.
// matched: quote items the value covers; valueKeeps(word) -> does the value keep that qualifier?
function droppedQualifiers(quoteItems, matched, valueKeeps) {
  const dropped = new Set();
  const sentences = new Set(matched.map(m => m.sent));
  for (const sent of sentences) {
    const items = matched.filter(m => m.sent === sent);
    const lo = Math.min(...items.map(m => m.pos));
    const hi = Math.max(...items.map(m => m.pos));
    const clauses = new Set(items.map(m => m.clause));
    for (const t of quoteItems) {
      if (t.sent !== sent || !QUALIFIERS.has(t.w)) continue;
      const near = t.pos < lo ? lo - t.pos <= cfg.QUALIFIER_DISTANCE : t.pos > hi ? t.pos - hi <= cfg.QUALIFIER_DISTANCE : true;
      const attached = AUDIENCE.has(t.w)
        ? clauses.has(t.clause) && near
        : near || (t.clauseStart && (clauses.has(t.clause - 1) || clauses.has(t.clause + 1)));
      if (attached && !valueKeeps(t.w)) dropped.add(t.w);
    }
  }
  return [...dropped];
}

// -> { ok: true } | { ok: false, reason, detail? }
function textValueSupportedByQuote(value, quote) {
  const v = analyse(value);
  const q = analyse(quote);

  // Content = every token except stopwords. Length is NOT a filter: numbers and 2-letter tokens
  // ("DM", "15") are real claims and must be in the quote.
  const content = v.filter(t => t.negation || !STOPWORDS.has(t.w));
  if (content.length === 0) return { ok: false, reason: 'value_has_no_content' };

  const claims = content.filter(t => !t.negation);
  const matches = new Map(claims.map(t => [t, q.filter(x => !x.negation && wordsMatch(t.w, x.w))]));
  const missing = claims.filter(t => matches.get(t).length === 0).map(t => t.w);
  if (missing.length > 0) return { ok: false, reason: 'value_adds_text', detail: missing };

  const quoteNegated = q.some(t => t.negation);
  const valueNegated = v.some(t => t.negation);
  if (quoteNegated && !valueNegated) return { ok: false, reason: 'value_drops_negation' };
  if (valueNegated && !quoteNegated) return { ok: false, reason: 'value_adds_negation' };

  // Negation SCOPE: each value word must be negated exactly where the quote negates it.
  const moved = claims.filter(t => !matches.get(t).some(x => x.negated === t.negated)).map(t => t.w);
  if (moved.length > 0) return { ok: false, reason: 'negation_scope_mismatch', detail: moved };

  // Attached qualifiers must be kept.
  const matched = [...new Set([...matches.values()].flat())];
  const valueWords = v.filter(t => !t.negation).map(t => t.w);
  const dropped = droppedQualifiers(q, matched, w => valueWords.some(vw => wordsMatch(vw, w)));
  if (dropped.length > 0) return { ok: false, reason: 'value_drops_qualifier', detail: dropped };

  return { ok: true };
}

// ------------------------------------------------------------------ exact excerpt (default for free text)

// The value must be one contiguous run of the quote's own words (case, spacing, punctuation and
// apostrophe style ignored; nothing paraphrased). The excerpt must not cut off a negation that
// governs its words, nor drop a qualifier attached to it.
function excerptSupportedByQuote(value, quote) {
  const v = analyse(value, false);
  const q = analyse(quote, false);
  if (!v.some(t => t.negation || !STOPWORDS.has(t.w))) return { ok: false, reason: 'value_has_no_content' };
  if (v.length > cfg.MAX_EXCERPT_WORDS) return { ok: false, reason: 'excerpt_too_long' };

  let firstFailure = null;
  let found = false;
  for (let s = 0; s + v.length <= q.length; s++) {
    if (!v.every((t, i) => q[s + i].w === t.w && q[s + i].sent === q[s].sent)) continue;
    found = true;
    const e = s + v.length;

    const cut = q.slice(s, e).filter(t => t.negated && t.negAt < s).map(t => t.w);
    if (cut.length > 0) { firstFailure ??= { ok: false, reason: 'excerpt_cuts_negation', detail: cut }; continue; }

    const inside = new Set(v.map(t => t.w));
    const dropped = droppedQualifiers(q, q.slice(s, e), w => inside.has(w));
    if (dropped.length > 0) { firstFailure ??= { ok: false, reason: 'value_drops_qualifier', detail: dropped }; continue; }

    return { ok: true };
  }
  return found ? firstFailure : { ok: false, reason: 'value_not_an_excerpt' };
}

// ------------------------------------------------------------------ enums

const SRC = {
  permission: 'permissions?|permits?|approvals?|clearances?|noc|authori[sz]ations?|licen[cs]es?|registrations?|consent',
  require: 'requires?|required|requirements?|mandatory|compulsory|necessary|must|needs?|needed|subject to|only with|prior|advance',
  prohibit: 'prohibits?|prohibited|prohibition|bans?|banned|forbidden|not allowed|not permitted|not permissible|disallowed|illegal|no drones?|cannot be (?:flown|used|operated|launched|taken)|may not be (?:flown|used|operated)|not to be (?:flown|used)',
  allow: 'allowed|permitted|permissible|may (?:fly|shoot|photograph)|can (?:fly|shoot)|can be (?:flown|used|operated|taken)|free to|freely',
  restrict: 'restricts?|restricted|restrictions?|no-fly|no fly|red zone|yellow zone|limited|limitations?|designated (?:areas?|zones?|spots?)|certain (?:areas?|zones?)|specified (?:areas?|zones?)|only in (?:the )?(?:designated|certain|specified|approved|marked) (?:areas?|zones?|spots?)',
  noPermissionNeeded: 'without\\s+(?:(?:any|prior|the|special|written)\\s+)*(?:permission|permit|approval|clearance|authori[sz]ation|license|consent)',
  condition: 'subject to|only (?:with|if|after|for)|fees?|charges?|booking|book',
  noLimit: 'no (?:restrictions?|limitations?|limits?|bans?)',
  droneTopic: 'drones?|uav',
  shootTopic: 'pre-?wedding|photo-?shoots?|shoots?|photograph(?:y|s)?|filming',
};
// "with / after / upon (obtaining) (prior) permission", "obtain / seek / apply for approval"
const PERM_WORD = '(?:permission|permit|approval|clearance|authori[sz]ation|consent)';
const ADJ = '(?:(?:the|prior|written|special|due|valid|proper|necessary|a|an)\\s+)*';
SRC.requirePhrase = `(?:with|after|upon|following)\\s+(?:(?:obtaining|getting|taking|securing)\\s+)?${ADJ}${PERM_WORD}|(?:obtain(?:ing)?|seek(?:ing)?|apply\\s+for|applying\\s+for|take|taking|secure|securing|get|getting)\\s+${ADJ}${PERM_WORD}`;

const RE = Object.fromEntries(Object.entries(SRC).map(([k, src]) => [k, wordRe(src)]));

const negatedAt = (clause, index) => wordsOf(clause.slice(0, index)).slice(-NEG_WINDOW).some(w => NEGATIONS.has(w));

function unnegatedIn(clause, re) {
  const rx = globalOf(re);
  let m;
  while ((m = rx.exec(clause)) !== null) {
    if (!negatedAt(clause, m.index)) return true;
    if (m[0].length === 0) rx.lastIndex++;
  }
  return false;
}
const unneg = (clauses, re) => clauses.some(c => unnegatedIn(c, re));
// A real requirement: permission word AND requirement word in ONE un-negated clause, or a requirement phrase.
const requirement = cs => cs.some(c => unnegatedIn(c, RE.permission) && unnegatedIn(c, RE.require)) || unneg(cs, RE.requirePhrase);

const allowedRule = topic => cs =>
  (unneg(cs, RE.allow) || cs.some(c => RE.noLimit.test(c) && topic.test(c))) &&
  !unneg(cs, RE.prohibit) &&
  !unneg(cs, RE.restrict) &&
  !requirement(cs) &&
  !(unneg(cs, RE.require) && unneg(cs, RE.permission));

const ENUM_RULES = {
  drone_status: {
    prohibited: cs => unneg(cs, RE.prohibit),
    restricted: cs => unneg(cs, RE.restrict),
    allowed: allowedRule(RE.droneTopic),
    // permission is REQUIRED, or flying is prohibited unless cleared ("prohibited without DGCA
    // clearance"). "flown without prior permission" is the opposite.
    allowed_with_permission: cs =>
      (requirement(cs) && !cs.some(c => RE.noPermissionNeeded.test(c))) ||
      cs.some(c => unnegatedIn(c, RE.prohibit) && /(?<![\p{L}])without(?![\p{L}])/u.test(c) && RE.permission.test(c)),
  },
  pre_wedding_shoot: {
    prohibited: cs => unneg(cs, RE.prohibit),
    allowed: allowedRule(RE.shootTopic),
    conditional: cs => requirement(cs) || unneg(cs, RE.condition),
  },
};

function enumSupportedByQuote(field, value, quote) {
  const rule = ENUM_RULES[field]?.[value];
  return !!rule && ENUMS[field].includes(value) && rule(clausesOf(quote));
}

// ------------------------------------------------------------------ dispatcher

// Dispatcher for the non-fee fields.
function valueSupportedByQuote(field, value, quote) {
  if (ENUMS[field]) {
    return enumSupportedByQuote(field, value, quote) ? { ok: true } : { ok: false, reason: 'value_not_supported_by_quote' };
  }
  return cfg.FREE_TEXT_MODE === 'paraphrase' ? textValueSupportedByQuote(value, quote) : excerptSupportedByQuote(value, quote);
}

module.exports = { valueSupportedByQuote, enumSupportedByQuote, textValueSupportedByQuote, excerptSupportedByQuote, wordsMatch, normalize };
