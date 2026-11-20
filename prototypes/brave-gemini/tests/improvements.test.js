// Regression tests for the "remaining improvements" pass: safe word matching, enum wording,
// the exact-excerpt contract, Unicode, attached qualifiers, news freshness and source coverage.
const test = require('node:test');
const assert = require('node:assert/strict');
const { wordsMatch, textValueSupportedByQuote: text, excerptSupportedByQuote: ex, enumSupportedByQuote: en, valueSupportedByQuote } = require('../value-support');
const { extractPublishedDate, assessFreshness, parseDate } = require('../freshness');
const { verifyFields } = require('../verify');
const { classifySource } = require('../source-policy');
const { buildQueries } = require('../pipeline');
const { LOCATIONS } = require('../locations');
const cfg = require('../config');

const loc = n => LOCATIONS.find(l => l.name.startsWith(n));

// ------------------------------------------------------------ safe word matching
test('stemming: inflections match; unrelated look-alikes do not', () => {
  for (const [a, b] of [['need', 'needed'], ['permit', 'permits'], ['permitted', 'permit'], ['authority', 'authorities'], ['require', 'required'], ['ban', 'banned'], ['book', 'booked'], ['allow', 'allowed'], ['tickets', 'ticket'], ['booking', 'book']]) {
    assert.equal(wordsMatch(a, b), true, `${a}/${b}`);
  }
  for (const [a, b] of [['prior', 'priority'], ['allow', 'allowance'], ['ban', 'bank'], ['ban', 'band'], ['free', 'fee'], ['tour', 'tourist'], ['allowed', 'prohibited'], ['required', 'optional'], ['permission', 'registration'], ['permission', 'license'], ['permitted', 'permission']]) {
    assert.equal(wordsMatch(a, b), false, `${a}/${b}`);
  }
});

test('synonyms: curated same-meaning groups only', () => {
  for (const [a, b] of [['prior', 'advance'], ['required', 'mandatory'], ['required', 'must'], ['needed', 'compulsory'], ['permission', 'approval'], ['permit', 'clearance'], ['booking', 'reservation'], ['photograph', 'photography'], ['requirement', 'require']]) {
    assert.equal(wordsMatch(a, b), true, `${a}/${b}`);
  }
  for (const [a, b] of [['prior', 'before'], ['required', 'optional'], ['permission', 'ticket']]) assert.equal(wordsMatch(a, b), false, `${a}/${b}`);
});

test('numbers are exact: digits never stem or fuzzy-match', () => {
  assert.equal(wordsMatch('15', '15'), true);
  assert.equal(wordsMatch('15', '150'), false);
  assert.equal(wordsMatch('15', '1'), false);
});

test('paraphrases that keep the meaning are accepted; changed meaning is still rejected', () => {
  const yes = [
    ['advance permission required', 'Tripods and drones will continue to require prior permission.'],
    ['permission needed', 'Permission is required for drones.'],
    ['approval required', 'Permission is required.'],
    ['permission from local authority', 'Permission from the local authorities is required.'],
    ['booking required', 'You must book in advance.'],
    ['authorization required', 'Authorisation is required.'],          // US/UK spelling
    ['license needed', 'A licence is needed.'],
    ['apply fifteen days in advance', 'Apply 15 days in advance.'],    // number words
    ['twenty five days', 'Notice of 25 days.'],
    ['ASI permission required', 'Permission from the Archaeological Survey of India is required.'], // approved acronym
    ['Directorate General of Civil Aviation clearance', 'DGCA clearance is required.'],
    ['NOC required', 'A No Objection Certificate is required.'],       // "no" inside the long form is not a negation
  ];
  for (const [v, q] of yes) assert.equal(text(v, q).ok, true, `${v} | ${q}`);
  const no = [
    ['permission required', 'Permission is optional.'],
    ['permitted', 'Permission is required.'],                           // "permitted" (allowed) is not "permission"
    ['permission needed 15 days', 'Permission needed 30 days.'],
    ['twenty five days', 'Notice of 20 5 days.'],
    ['KSTDC permission', 'Karnataka State Tourism Development Corporation permission'], // acronym not on the approved list
    ['permission required', 'Permission is not required.'],
    ['permission not required', 'Permission is required.'],
    ['registration required', 'Permission is required.'],
  ];
  for (const [v, q] of no) assert.equal(text(v, q).ok, false, `${v} | ${q}`);
});

// ------------------------------------------------------------ Unicode
test('Unicode: non-ASCII words are tokens (not dropped) and enum word boundaries respect letters', () => {
  assert.equal(ex('अनुमति आवश्यक है', 'ड्रोन उड़ाने के लिए अनुमति आवश्यक है।').ok, true);
  assert.equal(ex('ಅನುಮತಿ ಅಗತ್ಯ', 'ಡ್ರೋನ್ ಹಾರಿಸಲು ಅನುಮತಿ ಅಗತ್ಯ.').ok, true);
  assert.equal(ex('अनुमति आवश्यक है', 'ड्रोन की अनुमति नहीं है।').reason, 'value_not_an_excerpt');
  assert.equal(text('café permission', 'Permission is required at the café.').ok, true);
  assert.equal(text('école permission', 'Permission is required at the café.').reason, 'value_adds_text');
  assert.equal(en('drone_status', 'prohibited', 'Les drones sont éban.'), false);     // "ban" inside "éban" is not the word "ban"
  assert.equal(en('drone_status', 'prohibited', 'Drones are ban.'), true);
});

// ------------------------------------------------------------ enum wording
test('enum wording: new requirement / prohibition / allowance / restriction phrases', () => {
  const yes = [
    ['drone_status', 'allowed_with_permission', 'Drone flying is allowed after obtaining clearance.'],
    ['drone_status', 'allowed_with_permission', 'Visitors should seek approval before flying drones.'],
    ['drone_status', 'allowed_with_permission', 'Apply for permission to fly drones.'],
    ['drone_status', 'prohibited', 'Drones cannot be flown here.'],
    ['drone_status', 'prohibited', 'Drones may not be flown within the premises.'],
    ['drone_status', 'allowed', 'Drones can be flown freely in the gardens.'],
    ['drone_status', 'allowed', 'There is no restriction on drones.'],
    ['drone_status', 'allowed', 'There is no ban on drones.'],
    ['drone_status', 'restricted', 'Drones are permitted only in designated areas.'],
    ['pre_wedding_shoot', 'allowed', 'There is no restriction on pre-wedding shoots.'],
    ['pre_wedding_shoot', 'conditional', 'Pre-wedding shoots are permitted with permission from ASI.'],
    ['pre_wedding_shoot', 'conditional', 'Pre-wedding shoots are allowed after obtaining approval.'],
  ];
  for (const [f, v, q] of yes) assert.equal(en(f, v, q), true, `${v} | ${q}`);
});

test('enum wording: safety rules still hold (negation, topic, ambiguity)', () => {
  const no = [
    ['drone_status', 'allowed_with_permission', 'No need to obtain permission for drones.'],
    ['drone_status', 'allowed_with_permission', 'Do not apply for permission.'],
    ['drone_status', 'allowed_with_permission', 'Permission forms may be obtained at the desk.'],
    ['drone_status', 'allowed', 'There is no restriction on photography.'],                  // about photography, not drones
    ['drone_status', 'allowed', 'Drones are banned. There is no restriction on photography.'],
    ['drone_status', 'allowed', 'Drones are permitted only in designated areas.'],           // restricted, not simply allowed
    ['drone_status', 'allowed', 'Drone flying is allowed after obtaining clearance.'],       // needs permission
    ['drone_status', 'prohibited', 'There is no ban on drones.'],
    ['drone_status', 'restricted', 'There is no restriction on drones.'],
    ['pre_wedding_shoot', 'conditional', 'There is no fee for pre-wedding shoots.'],
    ['pre_wedding_shoot', 'conditional', 'Permission forms are available at the office.'],
  ];
  for (const [f, v, q] of no) assert.equal(en(f, v, q), false, `${v} | ${q}`);
});

// ------------------------------------------------------------ exact excerpt contract
test('excerpt: exact contiguous run of the quote (case, spacing, punctuation, apostrophes ignored)', () => {
  const quote = 'However, use of tripods and drones will continue to require prior permission, while separate approvals remain mandatory for film shoots.';
  assert.equal(ex('require prior permission', quote).ok, true);
  assert.equal(ex('REQUIRE   prior-permission', quote).ok, true);
  assert.equal(ex('tripods and drones will continue to require prior permission', quote).ok, true);
  for (const bad of ['permission require prior', 'require permission', 'will require prior permission', 'require prior permission and fees', 'advance permission required']) {
    assert.equal(ex(bad, quote).reason, 'value_not_an_excerpt', bad);
  }
  assert.equal(ex('', quote).reason, 'value_has_no_content');
  assert.equal(ex('the of', quote).reason, 'value_has_no_content');
  const longQuote = Array.from({ length: cfg.MAX_EXCERPT_WORDS + 5 }, (_, i) => `word${i}`).join(' ');
  assert.equal(ex(longQuote, longQuote).reason, 'excerpt_too_long');
});

test('excerpt: it may not cut off a negation that governs it', () => {
  const q = 'Booking is not required for photography.';
  assert.equal(ex('required for photography', q).reason, 'excerpt_cuts_negation');
  assert.equal(ex('is not required', q).ok, true);
  assert.equal(ex('Booking is not required for photography', q).ok, true);
  assert.equal(ex('Booking', q).ok, true);
  assert.equal(ex('booking isn’t required', "Booking isn't required.").ok, true); // same words, different apostrophe
});

test('excerpt: attached qualifiers must be kept; unrelated ones must not cause rejection', () => {
  const q1 = 'Permission is required only for commercial shoots.';
  assert.equal(ex('Permission is required', q1).reason, 'value_drops_qualifier');
  assert.equal(ex('Permission is required only for commercial shoots', q1).ok, true);
  // comma-separated limiter / leading condition are attached to the neighbouring clause
  assert.equal(ex('Permission is required', 'Permission is required, unless flying indoors.').reason, 'value_drops_qualifier');
  assert.equal(ex('permission is required', 'If you use a tripod, permission is required.').reason, 'value_drops_qualifier');
  assert.equal(ex('if you use a tripod permission is required', 'If you use a tripod, permission is required.').ok, true);
  // audience word in a DIFFERENT clause is unrelated
  assert.equal(ex('drones require prior permission', 'Photography is free for professional photographers, but drones require prior permission.').ok, true);
  // ... but in the SAME clause it is attached
  assert.equal(ex('require permission', 'Photographers require permission for commercial shoots.').reason, 'value_drops_qualifier');
  // conditional word far away in a long sentence is unrelated
  assert.equal(ex('drones require prior permission', 'Visitors get a refund if tickets are cancelled and drones require prior permission.').ok, true);
  // a qualifier in another sentence never counts
  assert.equal(ex('Permission is required', 'Permission is required. Only children are free.').ok, true);
});

test('default free-text mode is the excerpt contract', () => {
  assert.equal(cfg.FREE_TEXT_MODE, 'excerpt');
  assert.equal(valueSupportedByQuote('drone_permission', 'DGCA clearance', 'Drone flying requires DGCA clearance.').ok, true);
  assert.equal(valueSupportedByQuote('drone_permission', 'DGCA approval', 'Drone flying requires DGCA clearance.').reason, 'value_not_an_excerpt');
});

// ------------------------------------------------------------ news freshness
const NOW = new Date('2026-11-20T00:00:00Z');
const day = n => new Date(NOW.getTime() - n * 86400000).toISOString();

test('freshness: date formats and sources (metadata > URL > text)', () => {
  assert.equal(parseDate('2026-04-28T10:00:00+05:30').toISOString().slice(0, 10), '2026-04-28');
  assert.equal(parseDate('Apr 28, 2026').toISOString().slice(0, 10), '2026-04-28');
  assert.equal(parseDate('28 April 2026').toISOString().slice(0, 10), '2026-04-28');
  assert.equal(parseDate('31 Feb 2026'), null);
  const meta = '<meta property="article:published_time" content="2026-03-01T00:00:00Z"><script type="application/ld+json">{"datePublished":"2026-02-01"}</script>';
  const fromMeta = extractPublishedDate({ html: meta, url: 'https://x.com/2018/01/02/a' }, NOW);
  assert.equal(fromMeta.source, 'metadata');                                    // metadata wins over the old URL date
  assert.equal(fromMeta.date.toISOString().slice(0, 10), '2026-02-01');         // earliest within the strategy
  assert.equal(extractPublishedDate({ url: 'https://www.newindianexpress.com/states/karnataka/2026/Apr/29/no-camera-fees' }, NOW).date.toISOString().slice(0, 10), '2026-04-29');
  assert.equal(extractPublishedDate({ url: 'https://x.com/news/2022/10/27/story' }, NOW).date.toISOString().slice(0, 10), '2022-10-27');
  assert.equal(extractPublishedDate({ text: 'TNN | Apr 28, 2026, 10:21 IST  Hampi to allow cameras' }, NOW).source, 'text');
  assert.equal(extractPublishedDate({ text: 'No date here at all.' }, NOW), null);
  assert.equal(extractPublishedDate({ url: 'https://x.com/2030/01/01/a' }, NOW), null); // future dates are ignored
});

test('freshness: boundary at NEWS_MAX_AGE_DAYS; undated is not fresh', () => {
  assert.equal(assessFreshness(day(10), NOW, 365).fresh, true);
  assert.equal(assessFreshness(day(365), NOW, 365).fresh, true);
  assert.equal(assessFreshness(day(366), NOW, 365).reason, 'news_outdated');
  assert.equal(assessFreshness(null, NOW, 365).reason, 'news_date_unknown');
  assert.equal(assessFreshness('garbage', NOW, 365).reason, 'news_date_unknown');
});

test('verifyFields: outdated or undated NEWS is rejected for current conditions; official pages are not date-gated', () => {
  const l = loc('Fort Kochi');
  const q = 'Drone flying requires DGCA clearance.';
  const f = url => ({ drone_permission: { value: 'DGCA clearance', quote: q, source_url: url } });
  const mk = (tier, published, url) => ({ url, tier, published, text: `Fort Kochi, Kochi. ${q}` });
  const news = 'https://www.thehindu.com/a';
  const off = 'https://www.keralatourism.org/a';
  const run = (tier, published, url) => verifyFields(l, f(url), [mk(tier, published, url)], { now: NOW }).results.drone_permission;
  assert.equal(run('news', day(30), news).verified, true);
  assert.equal(run('news', day(800), news).reason, 'news_outdated');
  assert.equal(run('news', null, news).reason, 'news_date_unknown');
  assert.equal(run('official', null, off).verified, true);
  assert.equal(run('official', day(3000), off).verified, true);
});

// ------------------------------------------------------------ official-source coverage
test('coverage: KSTDC is Karnataka-only; DTPC Idukki is Munnar-only; nothing else widened', () => {
  assert.equal(classifySource('https://kstdc.co/hotels/hotel-mayura-valley-view-madikeri/', loc('Coorg')).tier, 'official');
  assert.equal(classifySource('https://kstdc.co/x', loc('Fort Kochi')).tier, null);
  assert.equal(classifySource('https://www.dtpcidukki.com/destination/munnar', loc('Munnar')).tier, 'official');
  for (const other of ['Coorg', 'Fort Kochi', 'Hampi', 'Bangalore']) assert.equal(classifySource('https://www.dtpcidukki.com/x', loc(other)).tier, null, other);
  for (const bad of ['https://kstdc.co.evil.com/x', 'https://notkstdc.co/x', 'https://dtpcidukki.com.evil.io/x', 'https://karnatakatourismhotels-in.pages.dev/hotels']) {
    assert.equal(classifySource(bad, loc('Coorg')).tier, null, bad);
  }
});

test('queries: still exactly two per location, now naming the state tourism board', () => {
  for (const l of LOCATIONS) {
    const qs = buildQueries(l);
    assert.equal(qs.length, cfg.MAX_SEARCHES_PER_LOCATION);
    for (const q of qs) assert.match(q, /official/);
  }
  assert.match(buildQueries(loc('Munnar'))[0], /Kerala Tourism/);
  assert.match(buildQueries(loc('Coorg'))[1], /Karnataka Tourism/);
});
