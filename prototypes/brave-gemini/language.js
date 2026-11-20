// Evidence language gate. The negation, qualifier, requirement and enum-wording checks in
// value-support.js understand ENGLISH ONLY (a Hindi "नहीं" or French "ne ... pas" would be
// invisible to them), so a quote for those fields must be English or the field is rejected.
//
//   - any letter outside the Latin script  -> rejected (Hindi, Kannada, Tamil, Arabic, CJK, ...)
//   - Latin-script text must look English: enough common English function / domain words
//     (so French, Spanish, German, ... are rejected too).
// Pure functions, no dependencies. Fee fields are not gated: their amount checks are numeric.

const CUES = new Set([
  // function words
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'at', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'from',
  'with', 'as', 'it', 'its', 'this', 'that', 'these', 'those', 'can', 'may', 'will', 'shall', 'must', 'should', 'also', 'any', 'all',
  'per', 'not', 'no', 'without', 'never', 'cannot', 'only', 'unless', 'except', 'if', 'but', 'however', 'while', 'before', 'after',
  'prior', 'advance', 'upon', 'than', 'then', 'there', 'their', 'they', 'you', 'your', 'we', 'our', 'who', 'which', 'when', 'where',
  'have', 'has', 'had', 'do', 'does', 'did', 'than', 'such', 'each', 'every', 'both', 'other', 'more', 'most', 'some', 'one',
  // domain words that appear in the rules we read
  'permission', 'permissions', 'permit', 'permits', 'permitted', 'approval', 'approvals', 'clearance', 'authority', 'authorities',
  'required', 'require', 'requires', 'requirement', 'mandatory', 'compulsory', 'necessary', 'need', 'needs', 'needed',
  'allowed', 'allow', 'allows', 'prohibited', 'prohibit', 'banned', 'ban', 'forbidden', 'restricted', 'restriction', 'restrictions',
  'drone', 'drones', 'flying', 'fly', 'flown', 'use', 'used', 'camera', 'photography', 'photograph', 'photographs', 'shoot', 'shoots',
  'shooting', 'film', 'filming', 'wedding', 'pre', 'photoshoot', 'booking', 'book', 'booked', 'reservation', 'apply', 'application',
  'fee', 'fees', 'charge', 'charges', 'entry', 'entrance', 'ticket', 'tickets', 'admission', 'free', 'visitors', 'visitor', 'tourists',
  'tourist', 'adults', 'adult', 'children', 'indian', 'indians', 'foreign', 'foreigners', 'nationals', 'national', 'person', 'people',
  'commercial', 'professional', 'monument', 'monuments', 'park', 'premises', 'zone', 'zones', 'area', 'areas', 'government', 'department',
]);

const MIN_CUE_RATIO = 0.34;

// -> { ok: true } | { ok: false, reason: 'no_letters' | 'non_latin_script' | 'not_english', detail? }
function isEnglishEvidence(text) {
  const s = String(text);
  const letters = s.match(/\p{L}/gu) || [];
  if (letters.length === 0) return { ok: false, reason: 'no_letters' };
  const foreign = letters.filter(ch => !/\p{Script=Latin}/u.test(ch));
  if (foreign.length > 0) return { ok: false, reason: 'non_latin_script', detail: [...new Set(foreign)].slice(0, 5).join('') };

  const words = s.toLowerCase().match(/\p{L}+/gu) || [];
  const cues = words.filter(w => CUES.has(w)).length;
  const ratio = cues / words.length;
  if (cues === 0 || ratio < MIN_CUE_RATIO) return { ok: false, reason: 'not_english', detail: `english cue ratio ${ratio.toFixed(2)}` };
  return { ok: true };
}

module.exports = { isEnglishEvidence, MIN_CUE_RATIO };
