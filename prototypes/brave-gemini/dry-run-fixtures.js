// Fake network boundary for dry runs: Brave, page hosts and Gemini are all simulated, so the
// REAL modules (limiter, safe fetcher, quote verifier, budget) run with zero network and zero keys.
// Each scenario exercises a different outcome so the verifier's rejections are visible.
const { Readable } = require('node:stream');
const { LOCATIONS } = require('./locations');

const PUBLIC_IP = [{ address: '93.184.216.34', family: 4 }];
const fakeLookup = async () => PUBLIC_IP;

const HOSTS = {
  'Bangalore Palace Grounds': 'https://karnatakatourism.org/palace',
  'Coorg Coffee Plantation': 'https://coorg.nic.in/plantation',
  'Fort Kochi': 'https://www.keralatourism.org/destination/fort-kochi',
  'Hampi Heritage Site': 'https://asi.nic.in/hampi',
  'Munnar Tea Gardens': 'https://www.dtpcidukki.com/destination/munnar',
};

function pageHtml(location) {
  return `<html><head><title>x</title><script>var a=1;</script></head><body>
<nav>Menu Home</nav>
<h1>${location.name}, ${location.city_name}</h1>
<p>Entry fee: ₹40 per person for Indian nationals.</p>
<p>Professional photography and pre-wedding shoots require prior permission; the shoot permit fee is ₹750 per day.</p>
<p>Drone flying is prohibited without permission from the local authority and DGCA clearance.</p>
<p>Drone flying requires permission from the local authority and DGCA clearance.</p>
<p>Advance booking is required for photography permission.</p>
</body></html>`;
}

// scenario by location index
//   0 normal  1 hallucinated quote  2 fee amount mismatch  3 no usable search results  4 normal
function modelAnswer(location, url, scenario) {
  const q = {
    pre: 'Professional photography and pre-wedding shoots require prior permission',
    booking: 'Advance booking is required for photography permission.',
    drone: 'Drone flying is prohibited without permission from the local authority and DGCA clearance.',
    dronePerm: 'Drone flying requires permission from the local authority and DGCA clearance.',
    entry: 'Entry fee: ₹40 per person for Indian nationals.',
    permit: 'the shoot permit fee is ₹750 per day',
  };
  const f = (value, quote) => ({ value, quote, source_url: url });
  const fields = {
    pre_wedding_shoot: f('conditional', q.pre),
    prior_booking: f('Advance booking is required for photography permission', q.booking),
    drone_status: f('prohibited', q.drone),
    drone_permission: f('Local authority and DGCA clearance', q.dronePerm),
    entry_fee: f('₹40', q.entry),
    shoot_permit_fee: f('₹750', q.permit),
  };
  if (scenario === 1) fields.shoot_permit_fee = f('₹750', 'the shoot permit fee is ₹750 per day, waived for weddings'); // not on the page
  if (scenario === 2) fields.entry_fee = f('₹400', q.entry); // amount differs from the quote
  return { fields, summary: `dry-run scenario ${scenario}` };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

// Adapts a fetch-style Response to the transport shape (status, headers.get, async-iterable body).
function toTransportResponse(res) {
  return { status: res.status, headers: { get: n => res.headers.get(n) }, body: res.body ? Readable.fromWeb(res.body) : Readable.from([]) };
}

function createDryRunNetwork() {
  const log = { braveCalls: [], pageCalls: [], geminiBodies: [] };
  const locationFor = text => LOCATIONS.find(l => text.includes(l.name));

  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    if (u.hostname === 'api.search.brave.com') {
      const q = u.searchParams.get('q');
      log.braveCalls.push(q);
      const loc = locationFor(q);
      const idx = LOCATIONS.indexOf(loc);
      const results = idx === 3
        ? [
            { title: 'Blog', url: 'https://travelblog.example.com/hampi', description: 'blog' },
            { title: 'Image', url: 'https://asi.nic.in/hampi.png', description: 'image' },
          ]
        : [
            { title: 'Official', url: HOSTS[loc.name], description: 'official' },
            { title: 'Blog', url: 'https://weddingblog.example.com/x', description: 'blog' },
            { title: 'Image', url: `${HOSTS[loc.name]}/hero.jpg`, description: 'img' },
          ];
      return jsonResponse({ web: { results } });
    }
    if (u.hostname === 'generativelanguage.googleapis.com') {
      const body = JSON.parse(init.body);
      log.geminiBodies.push(body);
      const prompt = body.contents[0].parts[0].text;
      const loc = locationFor(prompt);
      const idx = LOCATIONS.indexOf(loc);
      const url = Object.values(HOSTS).find(h => prompt.includes(h));
      return jsonResponse({
        candidates: [{ content: { parts: [{ text: JSON.stringify(modelAnswer(loc, url, idx)) }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: Math.ceil(prompt.length / 4), candidatesTokenCount: 450, thoughtsTokenCount: 50 },
      });
    }
    // page hosts
    log.pageCalls.push(u.href);
    if (u.pathname === '/robots.txt') return new Response('User-agent: *\nDisallow: /private/', { status: 200, headers: { 'content-type': 'text/plain' } });
    const loc = LOCATIONS.find(l => HOSTS[l.name] === u.href);
    if (!loc) return new Response('not found', { status: 404 });
    return new Response(pageHtml(loc), { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
  };

  // Page hosts go through the same transport interface the real (pinned) transport implements.
  const transport = async req => toTransportResponse(await fetchImpl(req.url, { headers: req.headers }));
  log.transportRequests = [];
  const recordingTransport = async req => { log.transportRequests.push({ hostname: req.hostname, addresses: req.addresses.map(a => a.address) }); return transport(req); };

  return { fetchImpl, transport: recordingTransport, lookup: fakeLookup, log };
}

module.exports = { createDryRunNetwork, HOSTS };
