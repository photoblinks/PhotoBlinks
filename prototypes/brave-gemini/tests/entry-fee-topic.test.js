const test = require('node:test');
const assert = require('node:assert/strict');
const { quoteMatchesFieldTopic } = require('../fields');
const { verifyFields } = require('../verify');
const { LOCATIONS } = require('../locations');

const PALACE = LOCATIONS.find(l => l.name.startsWith('Bangalore'));
const URL_OFFICIAL = 'https://karnatakatourism.org/en/attractions/bangalore-palace/';
const URL_NEWS = 'https://www.thehindu.com/news/bangalore-palace';
const FEE_QUOTE = 'Bangalore Palace charges approximately ₹240 for Indian adults and ₹460 for foreign tourists.';

const entry = (quote, official = true) => quoteMatchesFieldTopic('entry_fee', quote, { official });

test('the real Bangalore Palace quote is accepted for entry_fee on an official page', () => {
  assert.equal(entry(FEE_QUOTE), true);
});

test('valid visitor-context fee quotes (no "entry fee" / "ticket" words) are accepted', () => {
  for (const q of [
    'Rs. 50 for Indian visitors and Rs. 600 for foreign nationals.',
    '₹40 per person for Indians; ₹600 for foreigners.',
    'INR 25 for adults, INR 10 for children.',
    'Visitors from India pay ₹30; tourists from abroad pay ₹300.',
  ]) {
    assert.equal(entry(q), true, q);
  }
});

test('unrelated rupee amounts are rejected for entry_fee', () => {
  for (const q of [
    'Parking costs ₹50 for tourists.',
    'Hotel rooms for tourists start at ₹3,000 per night.',
    'Still photography costs ₹695 for adults.',
    'A camera charge of Rs. 285 applies to visitors.',
    'The drone permit deposit is ₹50,000 for tourists.',
    'Audio guide ₹20 for adults.',
    'Donation of ₹100 is welcome from visitors.',
    'Rent a bicycle for ₹200 per day.',            // amount, but no visitor context
    'The palace was built in 1887 at a cost of ₹10 lakh.', // amount, no visitor context
    'Adults and tourists are welcome to visit the palace.', // visitor context, no amount
    'Open from 10 AM, ₹240',                        // amount without visitor context
  ]) {
    assert.equal(entry(q), false, q);
  }
});

test('the official-source requirement is kept: the relaxed rule never applies off official pages', () => {
  assert.equal(quoteMatchesFieldTopic('entry_fee', FEE_QUOTE), false);                       // default: not official
  assert.equal(quoteMatchesFieldTopic('entry_fee', FEE_QUOTE, { official: false }), false);
});

test('the original keyword rule for entry_fee is unchanged (works with or without official)', () => {
  for (const official of [true, false]) {
    assert.equal(quoteMatchesFieldTopic('entry_fee', 'Entry fee: ₹40 per person.', { official }), true);
    assert.equal(quoteMatchesFieldTopic('entry_fee', 'Tickets are sold at the counter.', { official }), true);
  }
});

test('the relaxed rule applies to entry_fee ONLY: other fields keep their original topic rules', () => {
  for (const field of ['shoot_permit_fee', 'drone_status', 'drone_permission', 'prior_booking', 'pre_wedding_shoot']) {
    assert.equal(quoteMatchesFieldTopic(field, FEE_QUOTE, { official: true }), false, field);
  }
  assert.equal(quoteMatchesFieldTopic('shoot_permit_fee', 'The shoot permit fee is ₹750 per day.', { official: true }), true);
});

// ---- end to end through verifyFields ----

const FRESH = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); // news must be recent
const page = (url, tier) => ({ url, tier, published: FRESH, text: `Bangalore Palace, Bengaluru. ${FEE_QUOTE} Photography is allowed for a fee.` });
const fields = url => ({ entry_fee: { value: '₹240', quote: FEE_QUOTE, source_url: url } });

test('verifyFields: Bangalore Palace entry_fee is now verified from the official page', () => {
  const r = verifyFields(PALACE, fields(URL_OFFICIAL), [page(URL_OFFICIAL, 'official')]);
  assert.equal(r.results.entry_fee.verified, true);
  assert.equal(r.results.entry_fee.value, '₹240');
  assert.equal(r.results.entry_fee.tier, 'official');
});

test('verifyFields: the same quote from a news page is still rejected (official-source rule)', () => {
  const r = verifyFields(PALACE, fields(URL_NEWS), [page(URL_NEWS, 'news')]);
  assert.equal(r.results.entry_fee.verified, false);
  assert.equal(r.results.entry_fee.reason, 'fee_requires_official_source');
});

test('verifyFields: amount checks still apply (wrong amount, fabricated quote)', () => {
  const wrongAmount = verifyFields(PALACE, { entry_fee: { value: '₹24', quote: FEE_QUOTE, source_url: URL_OFFICIAL } }, [page(URL_OFFICIAL, 'official')]);
  assert.equal(wrongAmount.results.entry_fee.reason, 'amount_not_in_quote');
  const invented = 'Bangalore Palace charges approximately ₹300 for Indian adults.';
  const fab = verifyFields(PALACE, { entry_fee: { value: '₹300', quote: invented, source_url: URL_OFFICIAL } }, [page(URL_OFFICIAL, 'official')]);
  assert.equal(fab.results.entry_fee.reason, 'quote_not_in_page');
});

test('verifyFields: an unrelated rupee quote on an official page is still rejected', () => {
  const text = 'Bangalore Palace, Bengaluru. Parking costs ₹50 for tourists.';
  const q = 'Parking costs ₹50 for tourists.';
  const r = verifyFields(PALACE, { entry_fee: { value: '₹50', quote: q, source_url: URL_OFFICIAL } }, [{ url: URL_OFFICIAL, tier: 'official', text }]);
  assert.equal(r.results.entry_fee.verified, false);
  assert.equal(r.results.entry_fee.reason, 'quote_off_topic');
});

test('verifyFields: shoot_permit_fee does not benefit from the relaxation', () => {
  const r = verifyFields(PALACE, { shoot_permit_fee: { value: '₹240', quote: FEE_QUOTE, source_url: URL_OFFICIAL } }, [page(URL_OFFICIAL, 'official')]);
  assert.equal(r.results.shoot_permit_fee.verified, false);
  assert.equal(r.results.shoot_permit_fee.reason, 'quote_off_topic');
});
