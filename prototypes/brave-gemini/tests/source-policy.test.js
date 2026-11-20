const test = require('node:test');
const assert = require('node:assert/strict');
const { classifySource, allowUrlFor } = require('../source-policy');
const { createPageGetter } = require('../page-fetch');
const { verifyFields } = require('../verify');
const { LOCATIONS } = require('../locations');

const byName = n => LOCATIONS.find(l => l.name.startsWith(n));
const COORG = byName('Coorg');
const KOCHI = byName('Fort Kochi');
const tier = (url, loc) => classifySource(url, loc);

test('national authorities are official for every location', () => {
  for (const url of ['https://asi.nic.in/y', 'https://asimustsee.nic.in/x', 'https://digitalsky.dgca.gov.in/map', 'https://www.incredibleindia.org/a', 'https://www.incredibleindia.gov.in/en', 'https://tourism.gov.in/x']) {
    assert.equal(tier(url, COORG).tier, 'official', url);
  }
  // hosts that could not be confirmed were removed (asi.gov.in, sahmat.asi.gov.in): rejected until verified
  for (const url of ['https://asi.gov.in/x', 'https://sahmat.asi.gov.in/z']) assert.equal(tier(url, COORG).tier, null, url);
});

test('state authorities apply only to that location\'s state', () => {
  assert.equal(tier('https://www.keralatourism.org/destination/fort-kochi', KOCHI).tier, 'official');
  assert.equal(tier('https://plantations.kerala.gov.in/munnar', KOCHI).tier, null); // unverified *.kerala.gov.in host: no wildcard
  assert.equal(tier('https://www.keralatourism.org/x', COORG).reason, 'untrusted_domain'); // Kerala site, Karnataka place
  assert.equal(tier('https://karnatakatourism.org/x', COORG).tier, 'official');
  assert.equal(tier('https://karnatakatourism.org/x', KOCHI).reason, 'untrusted_domain');
});

test('district NIC sites are official only for their own location; arbitrary *.nic.in / *.gov.in are rejected', () => {
  assert.equal(tier('https://coorg.nic.in/plantation', COORG).tier, 'official');
  assert.equal(tier('https://coorg.nic.in/plantation', KOCHI).reason, 'untrusted_domain');
  assert.equal(tier('https://ernakulam.nic.in/x', KOCHI).tier, 'official');
  for (const url of ['https://random-dept.gov.in/x', 'https://someuniversity.nic.in/x', 'https://mha.gov.in/x', 'https://up.gov.in/x']) {
    assert.equal(tier(url, COORG).reason, 'untrusted_domain', url);
  }
});

test('lookalike hosts are rejected (suffix tricks, embedded names)', () => {
  for (const url of ['https://asi.nic.in.evil.com/x', 'https://evilasi.nic.in.attacker.io/x', 'https://notasi.gov.in/x', 'https://asi.gov.in.evil.com/', 'https://keralatourism.org.evil.com/', 'https://thehindu.com.evil.com/a']) {
    assert.equal(tier(url, KOCHI).tier, null, url);
  }
  // exact hosts only: an unlisted subdomain of an allowed authority is NOT trusted (no wildcards)
  assert.equal(tier('https://sub.keralatourism.org/a', KOCHI).tier, null);
  assert.equal(tier('https://www.keralatourism.org/a', KOCHI).tier, 'official'); // only a leading www is ignored
});

test('news: exact hosts only (www ignored); no arbitrary subdomains of news domains', () => {
  assert.equal(tier('https://www.thehindu.com/news/a.ece', KOCHI).tier, 'news');
  assert.equal(tier('https://timesofindia.indiatimes.com/city/x', KOCHI).tier, 'news');
  for (const url of ['https://blogs.timesofindia.indiatimes.com/x', 'https://anything.indiatimes.com/x', 'https://user.thehindu.com/x', 'https://epaper.hindustantimes.com/x']) {
    assert.equal(tier(url, KOCHI).tier, null, url);
  }
});

test('http, images, redirects and invalid URLs are rejected with explicit reasons', () => {
  assert.equal(tier('http://asi.nic.in/x', KOCHI).reason, 'not_https');
  assert.equal(tier('https://asi.nic.in/map.PNG', KOCHI).reason, 'image');
  assert.equal(tier('https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc', KOCHI).reason, 'redirect');
  assert.equal(tier('javascript:alert(1)', KOCHI).reason, 'invalid_url');
  assert.equal(tier('not a url', KOCHI).reason, 'invalid_url');
});

test('no location context: only shared hosts pass (no location-specific district sites)', () => {
  assert.equal(classifySource('https://asi.nic.in/x', null).tier, 'official');
  assert.equal(classifySource('https://keralatourism.org/x', null).tier, 'official');
  assert.equal(classifySource('https://coorg.nic.in/x', null).tier, null);
});

test('policy is enforced in the cached page getter BEFORE the cache (stale broad-policy entries are not served)', async () => {
  const store = new Map();
  const cache = { get: (k, key) => store.get(k + key), set: (k, key, v) => store.set(k + key, v) };
  store.set('pagehttps://random-dept.gov.in/x', { url: 'https://random-dept.gov.in/x', text: 'cached under an old broad policy', truncated: false });
  const getPage = createPageGetter({ cache, transport: async () => { throw new Error('no network'); }, lookup: async () => [{ address: '93.184.216.34', family: 4 }] });
  const r = await getPage('https://random-dept.gov.in/x', allowUrlFor(COORG));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'untrusted_domain');
});

test('fee fields are verified only from OFFICIAL pages; news can support permission and drone fields', () => {
  const loc = KOCHI;
  const text = 'Fort Kochi. Entry fee: ₹40 per person.\nDrone flying is prohibited without permission.';
  const url = 'https://www.thehindu.com/news/fort-kochi';
  const fields = {
    entry_fee: { value: '₹40', quote: 'Entry fee: ₹40 per person.', source_url: url },
    drone_status: { value: 'prohibited', quote: 'Drone flying is prohibited without permission.', source_url: url },
  };
  const published = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); // recent news
  const news = verifyFields(loc, fields, [{ url, text, tier: 'news', published }]);
  assert.equal(news.results.entry_fee.reason, 'fee_requires_official_source');
  assert.equal(news.results.drone_status.verified, true);
  assert.equal(news.results.drone_status.tier, 'news');
  const official = verifyFields(loc, { entry_fee: { ...fields.entry_fee, source_url: 'https://www.keralatourism.org/f' } }, [{ url: 'https://www.keralatourism.org/f', text, tier: 'official' }]);
  assert.equal(official.results.entry_fee.verified, true);
});

test('location mappings: each place trusts its own district site and the others do not', () => {
  const expected = {
    'Bangalore Palace Grounds': { own: 'https://karnatakatourism.org/en/attractions/bangalore-palace', notOwn: ['https://bangalorepalace.in/tickets'] },
    'Coorg Coffee Plantation': { own: 'https://kodagu.nic.in/', also: ['https://coorg.nic.in/'] },
    'Fort Kochi': { own: 'https://ernakulam.nic.in/en/about-district/' },
    'Hampi Heritage Site': { own: 'https://vijayanagara.nic.in/?p=1848', notOwn: ['https://ballari.nic.in/?p=1532', 'https://hampi.in/hampi-tour-cost-and-budget'] },
    'Munnar Tea Gardens': { own: 'https://idukki.nic.in/', also: ['https://www.dtpcidukki.com/destination/munnar'], notOwn: ['https://plantations.kerala.gov.in/munnar'] },
  };
  const districtHosts = ['kodagu.nic.in', 'coorg.nic.in', 'ernakulam.nic.in', 'vijayanagara.nic.in', 'idukki.nic.in'];
  for (const loc of LOCATIONS) {
    const e = expected[loc.name];
    assert.equal(classifySource(e.own, loc).tier, 'official', `${loc.name} own`);
    for (const u of e.also || []) assert.equal(classifySource(u, loc).tier, 'official', `${loc.name} ${u}`);
    for (const u of e.notOwn || []) assert.equal(classifySource(u, loc).tier, null, `${loc.name} ${u}`);
    // other places' district sites are not trusted here
    for (const host of districtHosts) {
      if ((loc.officialHosts || []).includes(host)) continue;
      assert.equal(classifySource(`https://${host}/x`, loc).tier, null, `${loc.name} must not trust ${host}`);
    }
  }
  assert.equal(LOCATIONS.length, 5);
  // Hampi is in Vijayanagara district; Ballari must not be listed for it
  assert.ok(!byName('Hampi').officialHosts.includes('ballari.nic.in'));
});

test('hostname edge cases: trailing dot, userinfo trick, uppercase and punycode lookalikes', () => {
  assert.equal(classifySource('https://asi.nic.in./x', KOCHI).tier, null);            // trailing dot is not matched
  assert.equal(classifySource('https://ASI.NIC.IN/x', KOCHI).tier, 'official');       // URL lower-cases the host
  assert.equal(classifySource('https://asi.nic.in@evil.example.com/x', KOCHI).tier, null);
  assert.equal(classifySource('https://xn--asi-nic-in-9kb.example/x', KOCHI).tier, null);
});

test('image detection needs a real extension: "photograph" and "apng" paths are not images', () => {
  assert.equal(classifySource('https://asi.nic.in/photograph', KOCHI).tier, 'official');
  assert.equal(classifySource('https://asi.nic.in/map.PNG', KOCHI).reason, 'image');
});
