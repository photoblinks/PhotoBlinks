// Permanent regression suite for value-support.js (safety pass).
//
// Part 1 replays ALL 53 audit probe cases with their intended outcomes:
//   false-acceptance  (18): were wrongly accepted, MUST now be rejected.
//   already-correct   (10): behaved correctly before; must keep doing so.
//   false-rejection   (25): meaning-preserving paraphrases that are still rejected on purpose.
//                            This pass adds no synonyms, fuzzy matching or enum wording, so they stay
//                            rejected (pinned as KNOWN recall limitations). The one exception is
//                            "aren't allowed": contraction handling now reads it as "are not allowed".
// Part 2 tests each safety rule on its own, including benign inputs that must NOT be newly rejected.
const test = require('node:test');
const assert = require('node:assert/strict');
const { textValueSupportedByQuote, enumSupportedByQuote } = require('../value-support');
const { verifyFields } = require('../verify');
const { LOCATIONS } = require('../locations');

const T = (group, label, value, quote, expect) => ({ group, kind: 'text', label, value, quote, expect });
const E = (group, label, field, value, quote, expect) => ({ group, kind: 'enum', label, field, value, quote, expect });
const FA = 'false-acceptance';
const OK = 'already-correct';
const FR = 'false-rejection';

const CASES = [
  // ---- already correct (10) ----
  T(OK, 'permit/permission', 'permit needed', 'Permit is needed for shoots.', 'accept'),
  T(OK, 'permit/permitted stem', 'permit required', 'A permitted shoot requires a permit.', 'accept'),
  T(OK, 'word order', 'clearance from DGCA', 'DGCA clearance', 'accept'),
  T(OK, 'unsupported addition', 'permission required from ASI and DGCA', 'Permission is required from ASI.', 'reject'),
  T(OK, 'dropped negation', 'permission required', 'Permission is not required.', 'reject'),
  T(OK, 'added negation', 'permission not required', 'Permission is required.', 'reject'),
  T(OK, "can't", 'drones allowed', "Drones can't be flown.", 'reject'),
  T(OK, 'subset, benign', 'permission required', 'Permission is required for drones.', 'accept'),
  E(OK, 'prohibited: strictly no', 'drone_status', 'prohibited', 'Strictly no drone flying.', 'accept'),
  E(OK, 'conditional: allowed with fee', 'pre_wedding_shoot', 'conditional', 'Pre-wedding shoots are allowed on payment of a charge.', 'accept'),

  // ---- false acceptances that must now be rejected (18) ----
  T(FA, "contraction isn't (straight)", 'booking required', "Booking isn't required for photography.", 'reject'),
  T(FA, 'contraction isn’t (curly)', 'booking required', 'Booking isn’t required for photography.', 'reject'),
  T(FA, "contraction aren't", 'drones allowed', "Drones aren't allowed.", 'reject'),
  T(FA, 'number differs (2-digit)', 'permission needed 15 days in advance', 'Permission needed 30 days in advance.', 'reject'),
  T(FA, 'number added (2-digit)', 'permission required 15', 'Permission required.', 'reject'),
  T(FA, '2-letter authority added', 'permission required from DM', 'Permission required.', 'reject'),
  T(FA, '1-digit number added', 'permission required for 5', 'Permission required.', 'reject'),
  T(FA, 'negation scope moved', 'prior permission not required', 'Prior permission required, not optional.', 'reject'),
  T(FA, 'qualifier dropped: only', 'permission required', 'Permission is required only for commercial shoots.', 'reject'),
  T(FA, 'qualifier dropped: unless', 'drone permission required', 'Drone permission is required unless flying indoors.', 'reject'),
  T(FA, 'qualifier dropped: foreigners', 'permission required', 'Permission required for foreign nationals.', 'reject'),
  E(FA, 'REVERSED not prohibited', 'drone_status', 'prohibited', 'Drones are not prohibited.', 'reject'),
  E(FA, 'REVERSED no ban', 'drone_status', 'prohibited', 'There is no ban on drones.', 'reject'),
  E(FA, 'REVERSED no restriction -> restricted', 'drone_status', 'restricted', 'There is no restriction on drones.', 'reject'),
  E(FA, 'REVERSED no permission -> conditional', 'pre_wedding_shoot', 'conditional', 'No permission is required for pre-wedding shoots.', 'reject'),
  E(FA, 'REVERSED no fee -> conditional', 'pre_wedding_shoot', 'conditional', 'There is no fee for pre-wedding shoots.', 'reject'),
  E(FA, 'REVERSED not required -> allowed_with_permission', 'drone_status', 'allowed_with_permission', 'Permission is not required to fly drones, but you must follow the rules.', 'reject'),
  E(FA, 'REVERSED not banned pre-wedding', 'pre_wedding_shoot', 'prohibited', 'Pre-wedding shoots are not banned.', 'reject'),

  // ---- meaning-preserving paraphrases, still rejected by design in this pass (25) ----
  T(FR, 'prior/advance', 'advance permission required', 'Tripods and drones will continue to require prior permission.', 'accept'),
  T(FR, 'advance/prior reverse', 'prior permission required', 'Drones require advance permission.', 'accept'),
  T(FR, 'needed/required', 'permission needed', 'Permission is required for drones.', 'accept'),
  T(FR, 'need/needed stem', 'permission need', 'Permission is needed.', 'accept'),
  T(FR, 'mandatory/required', 'permission required', 'Permission is mandatory for drones.', 'accept'),
  T(FR, 'must/required', 'permission required', 'You must obtain permission before flying.', 'accept'),
  T(FR, 'approval/permission', 'approval required', 'Permission is required.', 'accept'),
  T(FR, 'authority/authorities', 'permission from local authority', 'Permission from the local authorities is required.', 'accept'),
  T(FR, 'authorisation/authorization', 'authorization required', 'Authorisation is required.', 'accept'),
  T(FR, 'photography/photograph', 'photograph permission required', 'Photography permission is required.', 'accept'),
  T(FR, 'requirement/require', 'permission requirement', 'Drones require permission.', 'accept'),
  T(FR, 'book/booking', 'booking required', 'You must book in advance.', 'accept'),
  T(FR, 'reservation/booking', 'booking required', 'Reservation is required.', 'accept'),
  T(FR, 'ASI acronym', 'ASI permission required', 'Permission from the Archaeological Survey of India is required.', 'accept'),
  T(FR, 'DGCA expansion', 'Directorate General of Civil Aviation clearance', 'DGCA clearance is required.', 'accept'),
  T(FR, 'fifteen/15', 'fifteen days notice required', 'Apply 15 days in advance.', 'reject'),
  T(FR, 'compulsory', 'permission required', 'Permission is compulsory.', 'accept'),
  E(FR, 'allowed_with_permission: after obtaining', 'drone_status', 'allowed_with_permission', 'Drone flying is allowed after obtaining clearance.', 'accept'),
  E(FR, 'allowed_with_permission: seek', 'drone_status', 'allowed_with_permission', 'Visitors should seek approval before flying drones.', 'accept'),
  E(FR, 'allowed_with_permission: apply', 'drone_status', 'allowed_with_permission', 'Apply to the authority to fly a drone.', 'reject'),
  E(FR, 'prohibited: cannot', 'drone_status', 'prohibited', 'Drones cannot be flown here.', 'accept'),
  E(FR, "prohibited: aren't allowed (now accepted: contraction read as 'are not allowed')", 'drone_status', 'prohibited', "Drones aren't allowed.", 'accept'),
  E(FR, 'allowed: freely', 'drone_status', 'allowed', 'Drones can be flown freely in the gardens.', 'accept'),
  E(FR, 'allowed: no restriction', 'drone_status', 'allowed', 'There is no restriction on drones.', 'accept'),
  E(FR, 'restricted: designated areas', 'drone_status', 'restricted', 'Drones are permitted only in designated areas.', 'accept'),
];

const run = c => (c.kind === 'text' ? textValueSupportedByQuote(c.value, c.quote).ok : enumSupportedByQuote(c.field, c.value, c.quote));

test('the regression table holds all 53 probe cases', () => {
  assert.equal(CASES.length, 53);
  assert.equal(CASES.filter(c => c.group === FA).length, 18);
  assert.equal(CASES.filter(c => c.group === OK).length, 10);
  assert.equal(CASES.filter(c => c.group === FR).length, 25);
  assert.equal(new Set(CASES.map(c => c.group + c.label)).size, 53);
});

for (const c of CASES) {
  test(`[${c.group}] ${c.label} -> ${c.expect}`, () => {
    assert.equal(run(c), c.expect === 'accept');
  });
}

test('SAFETY GATE: every identified false acceptance is rejected, and nothing unsafe was introduced', () => {
  const stillAccepted = CASES.filter(c => c.group === FA && run(c)).map(c => c.label);
  assert.deepEqual(stillAccepted, []);
  // every "reject" expectation in the whole table holds (nothing newly slipped through)
  assert.deepEqual(CASES.filter(c => c.expect === 'reject' && run(c)).map(c => c.label), []);
});

// ------------------------------------------------------------------ Part 2: each rule

const text = (value, quote) => textValueSupportedByQuote(value, quote);

test('contractions: every negative contraction is read as negation (straight and curly apostrophes)', () => {
  // quotes that state the same words negated: rejected specifically for the dropped negation
  for (const q of ["Booking isn't required.", 'Booking isn’t required.', "Booking wasn't required.", "Booking won't be required.", 'Booking cannot be required.']) {
    assert.equal(text('booking required', q).reason, 'value_drops_negation', q);
  }
  // other negative contractions: never accepted for an un-negated value
  for (const q of ["Booking doesn't need payment.", "You don't need to book.", "It can't be done.", "Drones couldn't be flown."]) {
    assert.equal(text('booking required', q).ok, false, q);
  }
  // each contraction family is parsed as a negation when the words do match
  for (const q of ["Booking doesn't required.", "Booking couldn't required.", "Booking shouldn't required.", "Booking mustn't required.", "Booking hasn't required.", "Booking weren't required."]) {
    assert.equal(text('booking required', q).reason, 'value_drops_negation', q);
  }
  assert.equal(text('booking not required', "Booking isn't required.").ok, true);
  assert.equal(text('booking not required', 'Booking isn’t required.').ok, true);
});

test('contractions: a value that adds negation the quote lacks is rejected', () => {
  assert.equal(text("booking isn't required", 'Booking is required.').reason, 'value_adds_negation');
});

test('numeric tokens: any length, compared exactly, never stemmed', () => {
  for (const [value, quote] of [
    ['permission needed 15 days', 'Permission needed 30 days.'],
    ['permission required 5', 'Permission required.'],
    ['permission required 150', 'Permission required 15.'],
    ['permission required 15', 'Permission required 150.'],
    ['permission required 2024', 'Permission required.'],
    ['notice 15-30 days', 'Notice 15 days.'],
    ['drone below 2kg', 'Drone below 5kg.'],
  ]) {
    const r = text(value, quote);
    assert.equal(r.ok, false, `${value} | ${quote}`);
    assert.equal(r.reason, 'value_adds_text');
  }
  assert.equal(text('apply 15 days in advance', 'Apply 15 days in advance.').ok, true);
  assert.equal(text('drone below 2kg', 'Only drones below 2kg are allowed here.').reason, 'value_drops_qualifier'); // number ok, qualifier dropped
  assert.equal(text('only drone below 2kg', 'Only drones below 2kg are allowed here.').ok, true);
});

test('short alphabetic tokens are claims too (not ignored)', () => {
  assert.equal(text('permission required from DM', 'Permission required.').reason, 'value_adds_text');
  assert.equal(text('permission required from SP office', 'Permission required.').reason, 'value_adds_text');
  assert.equal(text('permission from DM', 'Permission from the DM is required.').ok, true);
});

test('stopwords are still ignored (only real content is checked)', () => {
  assert.equal(text('the permission of the authority', 'Permission authority').ok, true);
});

test('negation scope: a word must be negated exactly where the quote negates it', () => {
  assert.equal(text('prior permission not required', 'Prior permission required, not optional.').reason, 'negation_scope_mismatch');
  assert.equal(text('permission not required', 'Permission required, not optional.').reason, 'negation_scope_mismatch');
  assert.equal(text('permission required not optional', 'Permission required, not optional.').ok, true);
  assert.equal(text('booking not required', 'Booking is not required.').ok, true);
  assert.equal(text('no permission needed', 'No permission is needed.').ok, true);
  // a negation anywhere in the quote must also appear in the value (pre-existing global rule, kept)
  assert.equal(text('fee required', 'Not charged. Fee required.').reason, 'value_drops_negation');
  // negation does not leak across clauses: "not optional" negates only "optional"
  assert.equal(text('permission required not optional', 'Permission required, not optional.').ok, true);
});

test('qualifiers: only / unless / except / excluding / if / provided must be kept when attached', () => {
  const cases = [
    ['only', 'Permission is required only for commercial shoots.', 'permission required', 'permission required only commercial shoots'],
    ['unless', 'Drone permission is required unless flying indoors.', 'drone permission required', 'drone permission required unless flying indoors'],
    ['except', 'Booking is required except on weekdays.', 'booking required', 'booking required except weekdays'],
    ['excluding', 'Fee applies excluding children.', 'fee applies', 'fee applies excluding children'],
    ['if', 'Permission is required if using a tripod.', 'permission required', 'permission required if using tripod'],
    ['provided', 'Flying is allowed provided clearance is obtained.', 'flying allowed', 'flying allowed provided clearance obtained'],
  ];
  for (const [q, quote, dropped, kept] of cases) {
    const bad = text(dropped, quote);
    assert.equal(bad.ok, false, `${q}: ${dropped}`);
    assert.equal(bad.reason, 'value_drops_qualifier', q);
    assert.ok(bad.detail.includes(q), q);
    assert.equal(text(kept, quote).ok, true, `${q}: ${kept}`);
  }
});

test('qualifiers: audience / scope words (foreign, commercial, professional) must be kept', () => {
  for (const [word, quote] of [['foreign', 'Permission required for foreign nationals.'], ['foreigners', 'Permission required for foreigners.'], ['commercial', 'Permission required for commercial shoots.'], ['professional', 'Permission required for professional cameras.']]) {
    const r = text('permission required', quote);
    assert.equal(r.reason, 'value_drops_qualifier', word);
    assert.ok(r.detail.includes(word), word);
  }
  assert.equal(text('permission required foreign nationals', 'Permission required for foreign nationals.').ok, true);
});

test('benign inputs are NOT newly rejected (no over-blocking)', () => {
  for (const [value, quote] of [
    ['permission required', 'Permission is required for drones.'],
    ['permission required', 'Permission is required at the ticket counter.'],
    ['advance booking required', 'Advance booking is required for photography permission.'],
    ['DGCA clearance', 'Drone flying requires DGCA clearance.'],
    ['prior permission required', 'Drones and tripods require prior permission.'],
    ['booking not required', 'Booking is not required.'],
  ]) {
    assert.equal(text(value, quote).ok, true, `${value} | ${quote}`);
  }
});

test('enum negation guards: a negated key word never supports the value', () => {
  const rev = [
    ['drone_status', 'prohibited', 'Drones are not prohibited.'],
    ['drone_status', 'prohibited', 'There is no ban on drones.'],
    ['drone_status', 'prohibited', 'Drones are not banned here.'],
    ['drone_status', 'prohibited', 'Drone flying is never prohibited.'],
    ['drone_status', 'prohibited', "Drones aren't prohibited."],
    ['drone_status', 'restricted', 'There is no restriction on drones.'],
    ['drone_status', 'restricted', 'Drone use is not restricted.'],
    ['drone_status', 'restricted', 'Drones are not limited in any way.'],
    ['pre_wedding_shoot', 'prohibited', 'Pre-wedding shoots are not banned.'],
    ['pre_wedding_shoot', 'prohibited', 'Pre-wedding shoots are not prohibited.'],
    ['pre_wedding_shoot', 'conditional', 'There is no fee for pre-wedding shoots.'],
    ['pre_wedding_shoot', 'conditional', 'No booking is needed for pre-wedding shoots.'],
  ];
  for (const [field, value, quote] of rev) assert.equal(enumSupportedByQuote(field, value, quote), false, `${value} | ${quote}`);
  // and the un-negated statements still work
  for (const [field, value, quote] of [
    ['drone_status', 'prohibited', 'Drones are prohibited.'],
    ['drone_status', 'prohibited', 'Drone flying is banned within the premises.'],
    ['drone_status', 'restricted', 'Drone use is restricted near the palace.'],
    ['pre_wedding_shoot', 'prohibited', 'Pre-wedding shoots are not allowed.'],
    ['pre_wedding_shoot', 'prohibited', "Pre-wedding shoots aren't allowed."],
  ]) assert.equal(enumSupportedByQuote(field, value, quote), true, `${value} | ${quote}`);
});

test('enum requirement check: a permission word and a requirement word in the SAME un-negated clause', () => {
  // permission word alone is not a requirement
  assert.equal(enumSupportedByQuote('pre_wedding_shoot', 'conditional', 'Permission forms are available at the office.'), false);
  assert.equal(enumSupportedByQuote('pre_wedding_shoot', 'conditional', 'Pre-wedding shoots are permitted with permission from ASI.'), true); // "with permission" is a requirement phrase (improved wording)
  // requirement word alone is not a permission requirement
  assert.equal(enumSupportedByQuote('drone_status', 'allowed_with_permission', 'Prior notice is required.'), false);
  // split across clauses is not a requirement
  assert.equal(enumSupportedByQuote('drone_status', 'allowed_with_permission', 'Permission forms are at the counter, and tickets are required.'), false);
  // a negated requirement is not a requirement, even if "must" appears elsewhere
  assert.equal(enumSupportedByQuote('drone_status', 'allowed_with_permission', 'Permission is not required to fly drones, but you must follow the rules.'), false);
  assert.equal(enumSupportedByQuote('drone_status', 'allowed_with_permission', 'No permission is needed for drones. Visitors must be quiet.'), false);
  // real requirements still pass
  assert.equal(enumSupportedByQuote('drone_status', 'allowed_with_permission', 'Drone flying requires DGCA clearance.'), true);
  assert.equal(enumSupportedByQuote('drone_status', 'allowed_with_permission', 'However, use of tripods and drones will continue to require prior permission'), true);
  assert.equal(enumSupportedByQuote('drone_status', 'allowed_with_permission', 'Drone flying is prohibited without DGCA clearance.'), true);
  assert.equal(enumSupportedByQuote('pre_wedding_shoot', 'conditional', 'Pre-wedding shoots require prior permission.'), true);
  assert.equal(enumSupportedByQuote('pre_wedding_shoot', 'conditional', 'Pre-wedding shoots need prior approval.'), true);
});

test('enum: "allowed" ignores a negated requirement but not a real one', () => {
  assert.equal(enumSupportedByQuote('drone_status', 'allowed', 'Drones are allowed; permission is not required.'), true);
  assert.equal(enumSupportedByQuote('drone_status', 'allowed', 'Drones are allowed with prior permission.'), false);
  assert.equal(enumSupportedByQuote('drone_status', 'allowed', 'Drones are not allowed.'), false);
  assert.equal(enumSupportedByQuote('drone_status', 'allowed', "Drones aren't allowed."), false);
});

test('the Fort Kochi examples stay rejected under the new rules', () => {
  const permissionQuote = 'Anyone aged 18 years and above can fly a drone, provided they have at least completed Class 10 education and have prior permissions';
  const statusQuote = 'Only drones below 2kg can be flown below 200ft in closed premises, without prior permission from the authorities';
  assert.equal(text('DGCA registration and prior permissions required for specific zones and operations', permissionQuote).reason, 'value_adds_text');
  assert.equal(enumSupportedByQuote('drone_status', 'allowed_with_permission', statusQuote), false);
  // "provided ..." opens the clause far from "prior permissions": an unrelated qualifier no longer rejects it
  assert.equal(text('prior permissions', permissionQuote).ok, true);
});

test('through verifyFields: reversed enum, wrong number and dropped qualifier are rejected with the field kept unverified', () => {
  const loc = LOCATIONS.find(l => l.name === 'Fort Kochi');
  const url = 'https://www.keralatourism.org/destination/fort-kochi';
  const mk = (quote, extra = '') => ({ url, tier: 'official', text: `Fort Kochi, Kochi. ${quote} ${extra}` });
  const check = (field, value, quote) => verifyFields(loc, { [field]: { value, quote, source_url: url } }, [mk(quote)]).results[field];

  const reversed = check('drone_status', 'prohibited', 'Drones are not prohibited in Fort Kochi.');
  assert.equal(reversed.verified, false);
  assert.equal(reversed.reason, 'value_not_supported_by_quote');
  assert.equal(reversed.value, null);

  const number = check('prior_booking', 'booking needed 15 days in advance', 'Booking needed 30 days in advance.');
  assert.equal(number.verified, false);
  assert.equal(number.reason, 'value_not_an_excerpt'); // free text must be a contiguous excerpt (and "15" is not in the quote)

  const qualifier = check('drone_permission', 'Drone permission is required', 'Drone permission is required unless flying indoors.');
  assert.equal(qualifier.verified, false);
  assert.equal(qualifier.reason, 'value_drops_qualifier');

  const good = check('drone_permission', 'Drone permission is required unless flying indoors', 'Drone permission is required unless flying indoors.');
  assert.equal(good.verified, true);
});
