// Requirement 1: every non-fee value must be directly supported by its exact quote.
const test = require('node:test');
const assert = require('node:assert/strict');
const { valueSupportedByQuote, enumSupportedByQuote, textValueSupportedByQuote } = require('../value-support');
const { verifyFields } = require('../verify');
const { LOCATIONS } = require('../locations');

const KOCHI = LOCATIONS.find(l => l.name === 'Fort Kochi');
const HAMPI = LOCATIONS.find(l => l.name.startsWith('Hampi'));

// Exact texts from the live run.
const KOCHI_URL = 'https://timesofindia.indiatimes.com/city/kochi/new-drone-policy-has-wedding-videographers-in-a-fix/articleshow/65784010.cms';
const KOCHI_PERMISSION_QUOTE = 'Anyone aged 18 years and above can fly a drone, provided they have at least completed Class 10 education and have prior permissions';
const KOCHI_STATUS_QUOTE = 'Only drones below 2kg can be flown below 200ft in closed premises, without prior permission from the authorities';
const FRESH = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); // news must be recent
const KOCHI_PAGE = { url: KOCHI_URL, tier: 'news', published: FRESH, text: `Fort Kochi drone policy. ${KOCHI_PERMISSION_QUOTE}. ${KOCHI_STATUS_QUOTE}.` };
const KOCHI_UNSUPPORTED_VALUE = 'DGCA registration and prior permissions required for specific zones and operations';

test('REGRESSION Fort Kochi: drone_permission with additions beyond the quote is rejected', () => {
  const r = verifyFields(KOCHI, { drone_permission: { value: KOCHI_UNSUPPORTED_VALUE, quote: KOCHI_PERMISSION_QUOTE, source_url: KOCHI_URL } }, [KOCHI_PAGE]);
  assert.equal(r.results.drone_permission.verified, false);
  assert.equal(r.results.drone_permission.reason, 'value_not_an_excerpt');     // free text must be a contiguous excerpt
  assert.equal(r.results.drone_permission.value, null);                       // nothing proposed
  assert.equal(r.results.drone_permission.model_value, KOCHI_UNSUPPORTED_VALUE); // kept only as an audit trail
  const s = textValueSupportedByQuote(KOCHI_UNSUPPORTED_VALUE, KOCHI_PERMISSION_QUOTE);
  for (const added of ['dgca', 'registration', 'specific', 'zones', 'operations']) assert.ok(s.detail.includes(added), added);
});

test('REGRESSION Fort Kochi: drone_status allowed_with_permission contradicts "without prior permission"', () => {
  const r = verifyFields(KOCHI, { drone_status: { value: 'allowed_with_permission', quote: KOCHI_STATUS_QUOTE, source_url: KOCHI_URL } }, [KOCHI_PAGE]);
  assert.equal(r.results.drone_status.verified, false);
  assert.equal(r.results.drone_status.reason, 'value_not_supported_by_quote');
});

test('a value that only restates the quote is accepted (when the quote has no qualifier)', () => {
  const quote = 'Drone operators must have prior permissions from the authorities.';
  const page = { ...KOCHI_PAGE, text: `Fort Kochi drone policy. ${quote}` };
  const r = verifyFields(KOCHI, { drone_permission: { value: 'prior permissions', quote, source_url: KOCHI_URL } }, [page]);
  assert.equal(r.results.drone_permission.verified, true);
  assert.equal(r.results.drone_permission.value, 'prior permissions');
});

test('a qualifier far from the excerpt is unrelated and does not reject it; an attached one does', () => {
  // "provided" opens the clause far earlier in the sentence than the excerpt: unrelated
  const far = verifyFields(KOCHI, { drone_permission: { value: 'prior permissions', quote: KOCHI_PERMISSION_QUOTE, source_url: KOCHI_URL } }, [KOCHI_PAGE]);
  assert.equal(far.results.drone_permission.verified, true);
  // "only" sits right next to the excerpt: attached, so dropping it is rejected
  const quote = 'Drone operators must have prior permissions only for commercial flights.';
  const page = { ...KOCHI_PAGE, text: `Fort Kochi drone policy. ${quote}` };
  const near = verifyFields(KOCHI, { drone_permission: { value: 'prior permissions', quote, source_url: KOCHI_URL } }, [page]);
  assert.equal(near.results.drone_permission.verified, false);
  assert.equal(near.results.drone_permission.reason, 'value_drops_qualifier');
});

test('Hampi: drone_status allowed_with_permission is supported by "require prior permission"', () => {
  const quote = 'However, use of tripods and drones will continue to require prior permission';
  assert.equal(valueSupportedByQuote('drone_status', 'allowed_with_permission', quote).ok, true);
});

test('Hampi: "advance permission required" is the same claim as "prior permission" (paraphrase matcher); the default excerpt contract needs the quote itself', () => {
  const quote = 'However, use of tripods and drones will continue to require prior permission, while separate approvals remain mandatory for film shoots.';
  assert.equal(textValueSupportedByQuote('advance permission required', quote).ok, true);
  assert.equal(textValueSupportedByQuote('prior permission required', quote).ok, true);
  // default free-text mode is the excerpt contract: a paraphrase is not an excerpt, the quote's own words are
  assert.equal(valueSupportedByQuote('prior_booking', 'advance permission required', quote).reason, 'value_not_an_excerpt');
  assert.equal(valueSupportedByQuote('prior_booking', 'require prior permission', quote).ok, true);
});

test('enum values need wording that states THAT value', () => {
  // drone_status
  assert.equal(enumSupportedByQuote('drone_status', 'prohibited', 'Drone flying is banned within the premises.'), true);
  assert.equal(enumSupportedByQuote('drone_status', 'prohibited', 'Drones require prior permission.'), false);
  assert.equal(enumSupportedByQuote('drone_status', 'allowed_with_permission', 'Drone flying requires DGCA clearance.'), true);
  assert.equal(enumSupportedByQuote('drone_status', 'allowed_with_permission', 'Drone flying is prohibited without DGCA clearance.'), true); // prohibited UNLESS cleared
  assert.equal(enumSupportedByQuote('drone_status', 'allowed_with_permission', 'Drones may be flown without prior permission.'), false);
  assert.equal(enumSupportedByQuote('drone_status', 'restricted', 'Drone use is restricted near the palace.'), true);
  assert.equal(enumSupportedByQuote('drone_status', 'restricted', 'Drone flying is welcome.'), false);
  assert.equal(enumSupportedByQuote('drone_status', 'allowed', 'Drones are allowed in the gardens.'), true);
  assert.equal(enumSupportedByQuote('drone_status', 'allowed', 'Drones are allowed with prior permission.'), false);
  assert.equal(enumSupportedByQuote('drone_status', 'allowed', 'Drones are not allowed.'), false);
  // pre_wedding_shoot
  assert.equal(enumSupportedByQuote('pre_wedding_shoot', 'prohibited', 'Pre-wedding shoots are not allowed.'), true);
  assert.equal(enumSupportedByQuote('pre_wedding_shoot', 'conditional', 'Pre-wedding shoots require prior permission.'), true);
  assert.equal(enumSupportedByQuote('pre_wedding_shoot', 'allowed', 'Pre-wedding shoots are allowed.'), true);
  assert.equal(enumSupportedByQuote('pre_wedding_shoot', 'allowed', 'Pre-wedding shoots require prior permission.'), false);
  assert.equal(enumSupportedByQuote('pre_wedding_shoot', 'allowed', 'The monument opens at 9 AM.'), false);
  // unknown enum value / field
  assert.equal(enumSupportedByQuote('drone_status', 'maybe', 'Drones are allowed.'), false);
  assert.equal(enumSupportedByQuote('entry_fee', 'allowed', 'Drones are allowed.'), false);
});

test('free text: extra words, added/dropped negation and empty values are rejected', () => {
  const q = 'Advance booking is required for photography permission.';
  assert.equal(textValueSupportedByQuote('Advance booking required', q).ok, true);
  assert.equal(textValueSupportedByQuote('booking required', q).ok, true);                 // subset of the quote is fine
  assert.equal(textValueSupportedByQuote('Advance booking required online', q).reason, 'value_adds_text');
  assert.equal(textValueSupportedByQuote('Advance booking required via ASI portal', q).reason, 'value_adds_text');
  assert.equal(textValueSupportedByQuote('No booking required', q).reason, 'value_adds_negation');
  assert.equal(textValueSupportedByQuote('Booking required', 'Booking is not required for photography.').reason, 'value_drops_negation');
  assert.equal(textValueSupportedByQuote('Booking not required', 'Booking is not required for photography.').ok, true);
  assert.equal(textValueSupportedByQuote('the of and', q).reason, 'value_has_no_content');
  assert.equal(textValueSupportedByQuote('', q).reason, 'value_has_no_content');
});

test('free text: simple word-form differences (permission/permissions, require/required) still match', () => {
  assert.equal(textValueSupportedByQuote('permissions required', 'You must have prior permission and it is required').ok, true);
});

test('fee fields are not subject to the text rule (they use exact-amount checks)', () => {
  const page = { url: 'https://asi.nic.in/a', tier: 'official', text: 'Hampi. Entry fee: ₹40 per person for Indian nationals.' };
  const r = verifyFields(HAMPI, { entry_fee: { value: '₹40', quote: 'Entry fee: ₹40 per person for Indian nationals.', source_url: page.url } }, [page]);
  assert.equal(r.results.entry_fee.verified, true);
});

test('a rejected value never becomes a proposed value', () => {
  const r = verifyFields(KOCHI, { drone_permission: { value: KOCHI_UNSUPPORTED_VALUE, quote: KOCHI_PERMISSION_QUOTE, source_url: KOCHI_URL } }, [KOCHI_PAGE]);
  assert.equal(r.proposed.drone_permission, null);
  assert.equal(r.fieldVerified.drone_permission, false);
  assert.equal(r.confidence, 0);
});
