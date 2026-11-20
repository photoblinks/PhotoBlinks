// Live-readiness regression tests: English-only evidence, exact-host allowlist audit, news-date and
// official-source handling end to end, and Coorg / Munnar official-source queries.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { isEnglishEvidence } = require('../language');
const { verifyFields } = require('../verify');
const { buildProposals } = require('../proposals');
const { buildPrompt } = require('../gemini-lite');
const { classifySource, OFFICIAL_REGISTRY, NEWS_REGISTRY, NATIONAL_OFFICIAL, STATE_OFFICIAL } = require('../source-policy');
const { buildQueries, processLocation } = require('../pipeline');
const { createSearcher } = require('../brave');
const { createTracker } = require('../cost');
const { createCache } = require('../cache');
const { createPageGetter } = require('../page-fetch');
const { LOCATIONS } = require('../locations');
const { getPricing } = require('../../../gemini-pricing');
const cfg = require('../config');

const loc = n => LOCATIONS.find(l => l.name.startsWith(n));
const DAY = 24 * 60 * 60 * 1000;
const isoAgo = days => new Date(Date.now() - days * DAY).toISOString();

// ------------------------------------------------------------------ 1. English-only evidence

test('English evidence passes (short acronym phrases, rules, fees)', () => {
  for (const q of [
    'DGCA clearance', 'prior permissions', 'Drone flying requires DGCA clearance.',
    'Advance booking is required for photography permission.',
    'However, use of tripods and drones will continue to require prior permission',
    'Entry fee: ₹40 per person for Indian nationals.',
    'Only drones below 2kg can be flown below 200ft in closed premises, without prior permission from the authorities',
    'Pre-wedding shoots are not allowed.', "Booking isn't required.",
  ]) assert.deepEqual(isEnglishEvidence(q), { ok: true }, q);
});

test('non-Latin scripts are rejected outright (Hindi, Kannada, Tamil, Telugu, Arabic, CJK, Cyrillic)', () => {
  for (const q of [
    'ड्रोन उड़ाने के लिए अनुमति आवश्यक नहीं है', 'ಡ್ರೋನ್ ಹಾರಿಸಲು ಅನುಮತಿ ಅಗತ್ಯವಿಲ್ಲ', 'ட்ரோன் அனுமதி தேவையில்லை', 'డ్రోన్ అనుమతి అవసరం లేదు',
    'الطائرات بدون طيار ممنوعة', '禁止使用无人机', 'Дроны запрещены',
  ]) assert.equal(isEnglishEvidence(q).reason, 'non_latin_script', q);
  // a single foreign word inside English text is enough: its negation would be invisible
  assert.equal(isEnglishEvidence('Drone flying requires permission, अनुमति नहीं otherwise').reason, 'non_latin_script');
});

test('Latin-script non-English text is rejected (French, Spanish, German, Portuguese, Italian)', () => {
  for (const q of [
    'Les drones sont interdits sans autorisation préalable', 'Los drones están prohibidos sin permiso previo', 'Drohnen sind ohne vorherige Genehmigung verboten',
    'Os drones são proibidos sem autorização prévia', 'I droni sono vietati senza autorizzazione', 'Le drone est interdit',
  ]) assert.equal(isEnglishEvidence(q).reason, 'not_english', q);
  assert.equal(isEnglishEvidence('1234 ₹40 --').reason, 'no_letters');
  assert.equal(isEnglishEvidence('').reason, 'no_letters');
});

test('verifyFields: non-English quote is rejected for every non-fee field, and the existing data is kept', () => {
  const l = loc('Fort Kochi');
  const url = 'https://www.keralatourism.org/destination/fort-kochi';
  const hi = 'ड्रोन उड़ाने के लिए अनुमति आवश्यक नहीं है';
  const fr = 'Les drones sont interdits sans autorisation préalable';
  const page = { url, tier: 'official', text: `Fort Kochi, Kochi. ${hi}. ${fr}.` };
  const fields = {
    pre_wedding_shoot: { value: 'prohibited', quote: fr, source_url: url },
    drone_status: { value: 'prohibited', quote: fr, source_url: url },
    prior_booking: { value: hi, quote: hi, source_url: url },
    drone_permission: { value: hi, quote: hi, source_url: url },
  };
  const r = verifyFields(l, fields, [page]);
  for (const f of Object.keys(fields)) {
    assert.equal(r.results[f].verified, false, f);
    assert.equal(r.results[f].reason, 'non_english_evidence', f);
    assert.equal(r.results[f].value, null, f);
  }
  const existing = { pre_wedding_shoot: 'allowed', drone_status: 'restricted', prior_booking: 'Call office', drone_permission: '' };
  const { proposals, preserved } = buildProposals({ ...l, existing }, r.results);
  assert.equal(proposals.length, 0);
  for (const p of preserved.filter(x => x.field in existing)) assert.deepEqual(p.existing_value, existing[p.field]);
});

test('fee fields are not language-gated (their check is numeric): an English fee quote on a multilingual page still verifies', () => {
  const l = loc('Fort Kochi');
  const url = 'https://www.keralatourism.org/destination/fort-kochi';
  const quote = 'Entry fee: ₹40 per person for Indian nationals.';
  const page = { url, tier: 'official', text: `Fort Kochi, Kochi. ड्रोन अनुमति. ${quote}` };
  const r = verifyFields(l, { entry_fee: { value: '₹40', quote, source_url: url } }, [page]);
  assert.equal(r.results.entry_fee.verified, true);
});

test('the prompt asks for English quotes and current rules', () => {
  const prompt = buildPrompt(loc('Fort Kochi'), [{ url: 'https://www.keralatourism.org/x', excerpt: 'text' }]);
  assert.match(prompt, /MUST be in English/);
  assert.match(prompt, /CURRENT rules/);
});

// ------------------------------------------------------------------ 2. allowlist audit

const PUBLIC_SUFFIXES = new Set(['gov.in', 'nic.in', 'co.in', 'org.in', 'ac.in', 'edu.in', 'res.in', 'com', 'org', 'in', 'net']);
const wellFormed = h => /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(h) && h.split('.').length >= 2 && !h.includes('..') && !h.startsWith('www.') && !PUBLIC_SUFFIXES.has(h);

test('audit: every allowlisted host is an exact, lower-case, evidenced hostname (no wildcards, no bare public suffixes)', () => {
  const seen = new Set();
  for (const e of [...OFFICIAL_REGISTRY, ...NEWS_REGISTRY]) {
    assert.ok(wellFormed(e.host), `malformed host ${e.host}`);
    assert.ok(!/[*?]/.test(e.host), e.host);
    assert.ok(typeof e.evidence === 'string' && e.evidence.trim().length >= 10, `${e.host} needs evidence`);
    assert.ok(!seen.has(e.host), `duplicate ${e.host}`);
    seen.add(e.host);
  }
  for (const e of OFFICIAL_REGISTRY) assert.ok(['national', 'karnataka', 'kerala', 'location'].includes(e.scope), e.host);
});

test('audit: removed unverified wildcards stay removed', () => {
  const hosts = new Set([...OFFICIAL_REGISTRY, ...NEWS_REGISTRY].map(e => e.host));
  for (const gone of ['gov.in', 'nic.in', 'karnataka.gov.in', 'kerala.gov.in', 'asi.gov.in', 'sahmat.asi.gov.in', 'plantations.kerala.gov.in', 'indiatimes.com', 'mha.gov.in']) {
    assert.equal(hosts.has(gone), false, gone);
  }
});

test('audit: matching is exact: subdomains, parents and look-alikes of every host are rejected', () => {
  for (const e of [...OFFICIAL_REGISTRY.filter(x => x.scope !== 'location'), ...NEWS_REGISTRY]) {
    const l = loc('Fort Kochi');
    const others = [`https://evil.${e.host}/x`, `https://sub.${e.host}/x`, `https://${e.host}.evil.com/x`, `https://not${e.host}/x`, `https://${e.host}@evil.com/x`, `http://${e.host}/x`];
    for (const u of others) {
      const c = classifySource(u, l);
      assert.equal(c.tier, null, u);
    }
  }
});

test('audit: every location host is registered; unregistered location hosts are ignored', () => {
  const registered = new Set(OFFICIAL_REGISTRY.filter(e => e.scope === 'location').map(e => e.host));
  for (const l of LOCATIONS) for (const h of l.officialHosts) assert.ok(registered.has(h), `${l.name}: ${h} not registered`);
  const fake = { ...loc('Coorg'), officialHosts: ['evil-district.nic.in', 'kodagu.nic.in'] };
  assert.equal(classifySource('https://evil-district.nic.in/x', fake).tier, null);
  assert.equal(classifySource('https://kodagu.nic.in/x', fake).tier, 'official');
});

test('audit: scopes hold: national for all; state only for its state; location hosts only where listed', () => {
  for (const l of LOCATIONS) {
    for (const h of NATIONAL_OFFICIAL) assert.equal(classifySource(`https://${h}/x`, l).tier, 'official', `${l.name} ${h}`);
    for (const [state, hosts] of Object.entries(STATE_OFFICIAL)) {
      for (const h of hosts) {
        const expected = l.state_name.toLowerCase() === state ? 'official' : null;
        assert.equal(classifySource(`https://${h}/x`, l).tier, expected, `${l.name} ${h}`);
      }
    }
    for (const e of OFFICIAL_REGISTRY.filter(x => x.scope === 'location')) {
      const expected = l.officialHosts.includes(e.host) ? 'official' : null;
      assert.equal(classifySource(`https://${e.host}/x`, l).tier, expected, `${l.name} ${e.host}`);
    }
  }
});

test('audit: generic government / university / unknown hosts are never trusted', () => {
  for (const u of ['https://anything.gov.in/x', 'https://dept.karnataka.gov.in/x', 'https://dept.kerala.gov.in/x', 'https://someuniversity.ac.in/x', 'https://x.nic.in/x', 'https://blogs.timesofindia.indiatimes.com/x', 'https://epaper.thehindu.com/x']) {
    for (const l of LOCATIONS) assert.equal(classifySource(u, l).tier, null, `${l.name} ${u}`);
  }
});

// ------------------------------------------------------------------ 3. news dates + official handling, end to end

const tmpCache = () => createCache(fs.mkdtempSync(path.join(os.tmpdir(), 'bg-ready-test-')));
const html = ({ published, body }) => `<html><head>${published ? `<meta property="article:published_time" content="${published}">` : ''}</head><body><h1>Fort Kochi, Kochi</h1>${body}</body></html>`;
const BODY = '<p>Drone flying requires DGCA clearance.</p><p>Entry fee: ₹40 per person for Indian nationals.</p>';

async function runHarness({ results, pages, answer }) {
  const location = loc('Fort Kochi');
  const fetched = [];
  const fetchImpl = async url => {
    if (new URL(url).hostname === 'api.search.brave.com') return new Response(JSON.stringify({ web: { results } }), { status: 200, headers: { 'content-type': 'application/json' } });
    throw new Error(`unexpected fetch ${url}`);
  };
  const transport = async req => {
    const href = `https://${req.hostname}${req.path}`;
    fetched.push(href);
    const body = req.path === '/robots.txt' ? 'User-agent: *\nDisallow:' : pages[href];
    if (body === undefined) return { status: 404, headers: { get: () => 'text/html' }, body: Readable.from([Buffer.from('nope')]) };
    return { status: 200, headers: { get: n => (n.toLowerCase() === 'content-type' ? (req.path === '/robots.txt' ? 'text/plain' : 'text/html') : null) }, body: Readable.from([Buffer.from(body)]) };
  };
  const cache = tmpCache();
  const tracker = createTracker({ limitInr: cfg.TEST_BUDGET_INR, pricing: getPricing(cfg.MODEL) });
  const getPage = createPageGetter({ cache, transport, lookup: async () => [{ address: '93.184.216.34', family: 4 }] });
  const searcher = createSearcher({ apiKey: 'k', fetchImpl, cache, tracker });
  const callLlm = async () => ({ text: JSON.stringify(answer), usage: { inputTokens: 1000, outputTokens: 200 } });
  const record = await processLocation({ ...location, existing: { drone_permission: 'Call office', entry_fee: '₹30' } }, { searcher, getPage, callLlm, tracker, cache });
  return { record, fetched };
}

const answerFor = url => ({
  fields: {
    drone_permission: { value: 'DGCA clearance', quote: 'Drone flying requires DGCA clearance.', source_url: url },
    entry_fee: { value: '₹40', quote: 'Entry fee: ₹40 per person for Indian nationals.', source_url: url },
  },
  summary: 's',
});

test('end to end: OUTDATED news (date from page metadata) is rejected, existing data kept', async () => {
  const url = 'https://www.thehindu.com/news/kochi-drones';
  const { record } = await runHarness({ results: [{ title: 'n', url, description: 'd' }], pages: { [url]: html({ published: '2018-09-13T00:00:00Z', body: BODY }) }, answer: answerFor(url) });
  assert.equal(record.pages[0].tier, 'news');
  assert.equal(record.pages[0].published.slice(0, 10), '2018-09-13');
  assert.equal(record.fields.drone_permission.reason, 'news_outdated');
  assert.equal(record.proposals.length, 0);
  assert.equal(record.preserved.find(p => p.field === 'drone_permission').existing_value, 'Call office');
});

test('end to end: UNDATED news is rejected (fail-closed)', async () => {
  const url = 'https://www.thehindu.com/news/kochi-drones';
  const { record } = await runHarness({ results: [{ title: 'n', url, description: 'd' }], pages: { [url]: html({ body: BODY }) }, answer: answerFor(url) });
  assert.equal(record.pages[0].published, null);
  assert.equal(record.fields.drone_permission.reason, 'news_date_unknown');
  assert.equal(record.proposals.length, 0);
});

test('end to end: date taken from the URL when the page has no metadata (cached-page path too)', async () => {
  const stale = 'https://www.newindianexpress.com/states/kerala/2020/Nov/24/drones-in-kochi-1.html';
  const fresh = `https://www.newindianexpress.com/states/kerala/${new Date().getUTCFullYear()}/Jan/05/drones-in-kochi-2.html`;
  const a = await runHarness({ results: [{ title: 'n', url: stale, description: 'd' }], pages: { [stale]: html({ body: BODY }) }, answer: answerFor(stale) });
  assert.equal(a.record.fields.drone_permission.reason, 'news_outdated');
  // a January article of the current year is within 365 days unless the year just turned: assert on the parsed date, then on rule
  const b = await runHarness({ results: [{ title: 'n', url: fresh, description: 'd' }], pages: { [fresh]: html({ body: BODY }) }, answer: answerFor(fresh) });
  assert.match(b.record.pages[0].published, /^\d{4}-01-05/);
});

test('end to end: FRESH news supports permission/drone fields but never fees', async () => {
  const url = 'https://www.thehindu.com/news/kochi-drones';
  const { record } = await runHarness({ results: [{ title: 'n', url, description: 'd' }], pages: { [url]: html({ published: isoAgo(30), body: BODY }) }, answer: answerFor(url) });
  assert.equal(record.fields.drone_permission.verified, true);
  assert.equal(record.fields.entry_fee.reason, 'fee_requires_official_source');
  assert.deepEqual(record.proposals.map(p => p.field), ['drone_permission']);
  assert.equal(record.proposals[0].review_status, 'pending');
  assert.equal(record.preserved.find(p => p.field === 'entry_fee').existing_value, '₹30'); // fee data untouched
});

test('end to end: OFFICIAL page needs no date and verifies fees', async () => {
  const url = 'https://www.keralatourism.org/destination/fort-kochi';
  const { record } = await runHarness({ results: [{ title: 'o', url, description: 'd' }], pages: { [url]: html({ body: BODY }) }, answer: answerFor(url) });
  assert.equal(record.pages[0].tier, 'official');
  assert.equal(record.pages[0].published, null);
  assert.equal(record.fields.entry_fee.verified, true);
  assert.equal(record.fields.drone_permission.verified, true);
  assert.deepEqual(record.proposals.map(p => p.field).sort(), ['drone_permission', 'entry_fee']);
});

test('end to end: an official page outranks news and 4 results are capped at 3 pages', async () => {
  const news = [1, 2, 3].map(i => `https://www.thehindu.com/news/kochi-${i}`);
  const official = 'https://www.keralatourism.org/destination/fort-kochi';
  const pages = { [official]: html({ body: BODY }) };
  for (const n of news) pages[n] = html({ published: isoAgo(10), body: BODY });
  const { record, fetched } = await runHarness({
    results: [...news.map(url => ({ title: 'n', url, description: 'd' })), { title: 'o', url: official, description: 'd' }],
    pages, answer: answerFor(official),
  });
  assert.equal(record.pages.length, cfg.MAX_PAGES_PER_LOCATION);
  assert.equal(record.pages[0].url, official);            // official first although listed last
  assert.equal(fetched.filter(u => u.endsWith('kochi-3')).length, 0); // the 4th source is never fetched
  assert.equal(record.fields.entry_fee.verified, true);
});

test('end to end: a non-English official page yields no proposals and no changes', async () => {
  const url = 'https://www.keralatourism.org/destination/fort-kochi';
  const body = '<p>ड्रोन उड़ाने के लिए अनुमति आवश्यक नहीं है</p>';
  const answer = { fields: { drone_permission: { value: 'ड्रोन उड़ाने के लिए अनुमति आवश्यक नहीं है', quote: 'ड्रोन उड़ाने के लिए अनुमति आवश्यक नहीं है', source_url: url } }, summary: 's' };
  const { record } = await runHarness({ results: [{ title: 'o', url, description: 'd' }], pages: { [url]: html({ body }) }, answer });
  assert.equal(record.fields.drone_permission.reason, 'non_english_evidence');
  assert.equal(record.proposals.length, 0);
  assert.equal(record.preserved.find(p => p.field === 'drone_permission').existing_value, 'Call office');
});

// ------------------------------------------------------------------ 4. Coorg / Munnar queries

test('Coorg and Munnar queries name the district alias and the official authorities (still exactly two, no operators)', () => {
  const coorg = buildQueries(loc('Coorg'));
  const munnar = buildQueries(loc('Munnar'));
  for (const qs of [coorg, munnar]) {
    assert.equal(qs.length, cfg.MAX_SEARCHES_PER_LOCATION);
    for (const q of qs) {
      assert.ok(q.length <= 250, `${q.length} chars`);
      assert.doesNotMatch(q, /site:|inurl:| OR | AND /);
      assert.match(q, /official/);
    }
  }
  for (const q of coorg) { assert.match(q, /Kodagu/); assert.match(q, /Karnataka Tourism/); assert.match(q, /KSTDC/); assert.match(q, /Kodagu district administration/); assert.match(q, /Madikeri/); }
  for (const q of munnar) { assert.match(q, /Idukki/); assert.match(q, /Kerala Tourism/); assert.match(q, /DTPC Idukki/); assert.match(q, /Idukki district administration/); }
  assert.match(coorg[0], /pre-wedding photography permission drone/);
  assert.match(coorg[1], /entry fee ticket price photography permit fee/);
});

test('queries: other locations keep the tourism-board wording; aliases already in the name are not repeated', () => {
  assert.match(buildQueries(loc('Fort Kochi'))[0], /Kerala Tourism$/);
  assert.match(buildQueries(loc('Hampi'))[0], /Karnataka Tourism$/);
  const dup = buildQueries({ name: 'Kodagu Falls', city_name: 'Madikeri', state_name: 'Karnataka', search: { aliases: ['Kodagu'], authorities: ['KSTDC'] } })[0];
  assert.equal(dup.match(/Kodagu/g).length, 1);
});

test('every query still goes through the 2-search cap and the search limiter', async () => {
  const tracker = createTracker({ limitInr: cfg.TEST_BUDGET_INR, pricing: getPricing(cfg.MODEL) });
  const seen = [];
  const fetchImpl = async url => { seen.push(new URL(url).searchParams.get('q')); return new Response(JSON.stringify({ web: { results: [] } }), { status: 200 }); };
  const searcher = createSearcher({ apiKey: 'k', fetchImpl, cache: tmpCache(), tracker });
  for (const q of buildQueries(loc('Munnar'))) await searcher.search(q);
  await assert.rejects(searcher.search('a third query'), /Search limit reached/);
  assert.equal(seen.length, 2);
});
