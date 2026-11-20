const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { isPrivateIp, normalizeIp, parseRobots, robotsAllows } = require('../net-safety');
const { fetchPage, htmlToText, relevantExcerpt, safeGet } = require('../page-fetch');
const cfg = require('../config');

const PUBLIC = async () => [{ address: '93.184.216.34', family: 4 }];
// transport-shaped response
const res = (body, { status = 200, type = 'text/html', location } = {}) => ({
  status,
  headers: { get: n => ({ 'content-type': type, location }[String(n).toLowerCase()] ?? null) },
  body: Readable.from(body === null ? [] : [Buffer.from(body)]),
});
const ROBOTS_OK = () => res('User-agent: *\nDisallow: /private/', { type: 'text/plain' });
const LONG = '<p>' + 'Entry fee is ₹40 for visitors to the monument. '.repeat(3) + '</p>';
const isRobots = req => req.path === '/robots.txt';

test('isPrivateIp: private, loopback, metadata, CGNAT, TEST-NET, v6 and mapped ranges rejected; public allowed', () => {
  for (const ip of [
    '10.0.0.1', '127.0.0.1', '169.254.169.254', '172.16.5.4', '172.31.255.255', '192.168.1.1', '100.64.0.1', '0.0.0.0',
    '224.0.0.1', '255.255.255.255', '198.51.100.7', '203.0.113.9', '192.0.2.1', '198.18.0.1',
    '::1', '::', 'fe80::1', 'fd00::1', 'ff02::1', '2001:db8::1', '64:ff9b::a00:1', '2002:c000:204::1',
    '::ffff:10.0.0.1', '::ffff:a00:1', '::ffff:7f00:1', 'not-an-ip',
  ]) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  for (const ip of ['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:2800:220:1:248:1893:25c8:1946', '::ffff:5db8:d822']) {
    assert.equal(isPrivateIp(ip), false, ip);
  }
  assert.equal(normalizeIp('::FFFF:1.2.3.4'), '1.2.3.4');
});

test('robots: specific agent group wins, longest rule wins, Allow wins ties, no group allows', () => {
  const g = parseRobots('User-agent: *\nDisallow: /private/\nAllow: /private/open\n\nUser-agent: locationverifierbot\nDisallow: /blocked');
  assert.equal(robotsAllows(g, 'LocationVerifierBot/0.1', '/blocked/x'), false);
  assert.equal(robotsAllows(g, 'LocationVerifierBot/0.1', '/private/x'), true);
  const star = parseRobots('User-agent: *\nDisallow: /private/\nAllow: /private/open');
  assert.equal(robotsAllows(star, 'OtherBot/1', '/private/x'), false);
  assert.equal(robotsAllows(star, 'OtherBot/1', '/private/open'), true);
  assert.equal(robotsAllows(star, 'OtherBot/1', '/public'), true);
  assert.equal(robotsAllows([], 'X/1', '/anything'), true);
  assert.equal(robotsAllows(parseRobots('User-agent: *\nDisallow: /'), 'X/1', '/a'), false);
});

test('htmlToText: strips scripts/nav/tags, decodes entities, keeps line breaks', () => {
  const t = htmlToText('<head><title>t</title></head><script>x=1</script><nav>Menu</nav><p>Fee &amp; permit: &#8377;40</p><p>Drone&nbsp;banned</p>');
  assert.match(t, /Fee & permit: ₹40/);
  assert.match(t, /Drone banned/);
  assert.doesNotMatch(t, /x=1|Menu|<p>/);
  assert.ok(t.includes('\n'));
});

test('relevantExcerpt: short text unchanged; long text keeps fee/permission lines within the cap', () => {
  assert.equal(relevantExcerpt('short text', 100), 'short text');
  const filler = Array.from({ length: 200 }, (_, i) => `Unrelated sentence number ${i} about history.`).join('\n');
  const out = relevantExcerpt(`${filler}\nThe entry fee is ₹40 per person.\n${filler}`, 300);
  assert.ok(out.length <= 300);
  assert.match(out, /entry fee is ₹40/);
});

test('fetchPage: happy path returns text; robots.txt is fetched once per origin through the cache', async () => {
  const seen = [];
  const store = new Map();
  const cache = { get: (k, key) => store.get(k + key), set: (k, key, v) => store.set(k + key, v) };
  const transport = async req => { seen.push(req.path); return isRobots(req) ? ROBOTS_OK() : res(LONG); };
  const a = await fetchPage('https://asi.nic.in/hampi', { transport, lookup: PUBLIC, cache });
  const b = await fetchPage('https://asi.nic.in/other', { transport, lookup: PUBLIC, cache });
  assert.equal(a.ok, true);
  assert.match(a.text, /Entry fee is ₹40/);
  assert.equal(b.ok, true);
  assert.equal(seen.filter(p => p === '/robots.txt').length, 1);
});

test('fetchPage rejects: http, ip literal, credentials, port, untrusted domain, image, bad URL; network never touched', async () => {
  const never = async () => { throw new Error('network must not be touched'); };
  const deps = { transport: never, lookup: PUBLIC };
  const cases = [
    ['http://asi.nic.in/a', 'not_https'],
    ['https://93.184.216.34/a', 'ip_literal'],
    ['https://[2606:2800:220:1::1]/a', 'ip_literal'],
    ['https://user:pw@asi.nic.in/a', 'credentials_in_url'],
    ['https://asi.nic.in:8443/a', 'non_default_port'],
    ['https://travelblog.example.com/a', 'untrusted_domain'],
    ['https://asi.nic.in.evil.com/a', 'untrusted_domain'],
    ['https://asi.nic.in/a.png', 'untrusted_domain'],
    ['not a url', 'invalid_url'],
  ];
  for (const [url, reason] of cases) {
    const r = await fetchPage(url, deps);
    assert.equal(r.ok, false, url);
    assert.equal(r.reason, reason, url);
  }
});

test('private IP blocking: any private/loopback/metadata/mapped answer is refused before connecting', async () => {
  const never = async () => { throw new Error('must not connect'); };
  const answers = [
    [{ address: '10.0.0.5', family: 4 }],
    [{ address: '127.0.0.1', family: 4 }],
    [{ address: '169.254.169.254', family: 4 }],
    [{ address: '::1', family: 6 }],
    [{ address: '::ffff:192.168.0.1', family: 6 }],
    [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }], // one bad answer poisons the set
  ];
  for (const addrs of answers) {
    const r = await fetchPage('https://asi.nic.in/a', { transport: never, lookup: async () => addrs });
    assert.equal(r.reason, 'private_address', JSON.stringify(addrs));
  }
  assert.equal((await fetchPage('https://asi.nic.in/a', { transport: never, lookup: async () => [] })).reason, 'dns_failure');
  assert.equal((await fetchPage('https://asi.nic.in/a', { transport: never, lookup: async () => { throw new Error('ENOTFOUND'); } })).reason, 'dns_failure');
});

test('redirects: untrusted host, private DNS on the hop, loops and bad Location are all blocked', async () => {
  const redirectTo = target => async req => (isRobots(req) ? ROBOTS_OK() : res(null, { status: 302, location: target }));

  assert.equal((await fetchPage('https://asi.nic.in/a', { transport: redirectTo('https://evil.example.com/x'), lookup: PUBLIC })).reason, 'untrusted_domain');
  assert.equal((await fetchPage('https://asi.nic.in/a', { transport: redirectTo('http://asi.nic.in/x'), lookup: PUBLIC })).reason, 'not_https');
  assert.equal((await fetchPage('https://asi.nic.in/a', { transport: redirectTo('https://93.184.216.34/x'), lookup: PUBLIC })).reason, 'ip_literal');
  assert.equal((await fetchPage('https://asi.nic.in/a', { transport: redirectTo('/relative/loop'), lookup: PUBLIC })).reason, 'too_many_redirects');

  const lookup = async host => (host === 'dgca.gov.in' ? [{ address: '192.168.0.9', family: 4 }] : [{ address: '93.184.216.34', family: 4 }]);
  assert.equal((await fetchPage('https://asi.nic.in/a', { transport: redirectTo('https://dgca.gov.in/x'), lookup })).reason, 'private_address');

  const noLocation = async req => (isRobots(req) ? ROBOTS_OK() : res(null, { status: 302 }));
  assert.equal((await fetchPage('https://asi.nic.in/a', { transport: noLocation, lookup: PUBLIC })).reason, 'redirect_without_location');
});

test('redirects: a hop to another allowed host is followed, re-resolved and re-pinned to ITS validated address', async () => {
  const calls = [];
  const lookup = async host => [{ address: host === 'asi.nic.in' ? '93.184.216.34' : '151.101.1.1', family: 4 }];
  const transport = async req => {
    calls.push({ host: req.hostname, path: req.path, addresses: req.addresses.map(a => a.address) });
    if (isRobots(req)) return ROBOTS_OK();
    if (req.hostname === 'asi.nic.in') return res(null, { status: 301, location: 'https://dgca.gov.in/final' });
    return res(LONG);
  };
  const r = await fetchPage('https://asi.nic.in/start', { transport, lookup });
  assert.equal(r.ok, true);
  assert.equal(r.url, 'https://dgca.gov.in/final');
  const page = calls.filter(c => c.path !== '/robots.txt');
  assert.deepEqual(page[0], { host: 'asi.nic.in', path: '/start', addresses: ['93.184.216.34'] });
  assert.deepEqual(page[1], { host: 'dgca.gov.in', path: '/final', addresses: ['151.101.1.1'] });
});

test('fetchPage: robots disallow, non-HTML content, HTTP errors, empty pages, robots 5xx', async () => {
  const denyAll = async req => (isRobots(req) ? res('User-agent: *\nDisallow: /', { type: 'text/plain' }) : res(LONG));
  assert.equal((await fetchPage('https://asi.nic.in/a', { transport: denyAll, lookup: PUBLIC })).reason, 'robots_disallow');

  const pdf = async req => (isRobots(req) ? ROBOTS_OK() : res('%PDF', { type: 'application/pdf' }));
  assert.equal((await fetchPage('https://asi.nic.in/a', { transport: pdf, lookup: PUBLIC })).reason, 'unsupported_content_type');

  const notFound = async req => (isRobots(req) ? ROBOTS_OK() : res('nope', { status: 404 }));
  assert.equal((await fetchPage('https://asi.nic.in/a', { transport: notFound, lookup: PUBLIC })).reason, 'http_404');

  const empty = async req => (isRobots(req) ? ROBOTS_OK() : res('<p>hi</p>'));
  assert.equal((await fetchPage('https://asi.nic.in/a', { transport: empty, lookup: PUBLIC })).reason, 'empty_page');

  const robots5xx = async req => (isRobots(req) ? res('x', { status: 503, type: 'text/plain' }) : res(LONG));
  assert.equal((await fetchPage('https://asi.nic.in/a', { transport: robots5xx, lookup: PUBLIC })).reason, 'robots_unavailable');
});

test('safeGet caps the body size and flags truncation', async () => {
  const big = 'a'.repeat(cfg.PAGE_MAX_BYTES + 5000);
  const r = await safeGet('https://asi.nic.in/a', { transport: async () => res(big), lookup: PUBLIC });
  assert.equal(r.truncated, true);
  assert.equal(r.text.length, cfg.PAGE_MAX_BYTES);
});

test('requests use a generic User-Agent with no project or personal details', async () => {
  const agents = [];
  const transport = async req => { agents.push(req.headers['User-Agent']); return isRobots(req) ? ROBOTS_OK() : res(LONG); };
  await fetchPage('https://asi.nic.in/a', { transport, lookup: PUBLIC });
  assert.ok(agents.length >= 1);
  for (const ua of agents) assert.doesNotMatch(ua, /photoblinks|shubi|gmail/i);
});

test('regression: explicit undefined lookup/allowUrl fall back to the defaults (live mode passes undefined)', async () => {
  const dns = require('node:dns');
  const realLookup = dns.promises.lookup;
  let asked = 0;
  dns.promises.lookup = async () => { asked++; return [{ address: '93.184.216.34', family: 4 }]; };
  try {
    const transport = async req => (isRobots(req) ? ROBOTS_OK() : res(LONG));
    const r = await fetchPage('https://asi.nic.in/a', { transport, lookup: undefined, allowUrl: undefined });
    assert.equal(r.ok, true);
    assert.ok(asked >= 1);
  } finally {
    dns.promises.lookup = realLookup;
  }
});
