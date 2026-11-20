// Which sites may be fetched and trusted as evidence. EXACT HOSTS ONLY (a leading "www." is
// ignored): no suffix wildcards, no "any subdomain", no "*.gov.in" / "*.nic.in". Every host below
// carries the evidence it was verified with; an unverified host is simply absent (fail-closed).
// To add a host: confirm it is the real official site, then add it WITH its evidence.
//
//   official = national authorities + the location's STATE authorities + hosts listed on the
//              location itself that are also registered here (e.g. its district NIC site);
//              fees may only come from these.
//   news     = exact reputable-news hosts; may support permission and drone fields, never fees,
//              and only while recent (see verify.js / freshness.js).
// Anything else (other states' sites, blogs, aggregators, search redirects, images) is rejected.
const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|svg|avif|bmp|ico|tiff?)$/i;

// scope: 'national' | 'karnataka' | 'kerala' | 'location' (allowed only where a location lists it).
const OFFICIAL_REGISTRY = [
  // national authorities
  { host: 'asi.nic.in', scope: 'national', evidence: 'Archaeological Survey of India; its Hampi page was fetched in the live test' },
  { host: 'asimustsee.nic.in', scope: 'national', evidence: 'ASI "Must See" heritage site (listed by india.gov.in); appeared in live Hampi results' },
  { host: 'digitalsky.dgca.gov.in', scope: 'national', evidence: 'DGCA Digital Sky drone airspace platform (confirmed by web research)' },
  { host: 'dgca.gov.in', scope: 'national', evidence: 'parent domain of the confirmed Digital Sky host; seen in pilot results' },
  { host: 'tourism.gov.in', scope: 'national', evidence: 'Ministry of Tourism (listed by india.gov.in; terms of use name it)' },
  { host: 'incredibleindia.gov.in', scope: 'national', evidence: 'Ministry of Tourism Incredible India portal (confirmed by web research)' },
  { host: 'incredibleindia.org', scope: 'national', evidence: 'domain the Ministry of Tourism owns per the Incredible India terms of use' },
  // state tourism authorities
  { host: 'karnatakatourism.org', scope: 'karnataka', evidence: 'Karnataka Department of Tourism; fetched in the live test' },
  { host: 'kstdc.co', scope: 'karnataka', evidence: 'Karnataka State Tourism Development Corporation (confirmed by web research)' },
  { host: 'keralatourism.org', scope: 'kerala', evidence: 'Kerala Tourism; has Munnar / Fort Kochi pages (live results + web research)' },
  // district / place authorities (usable only by locations that list them)
  { host: 'kodagu.nic.in', scope: 'location', evidence: 'Kodagu (Coorg) district official site (confirmed by web research)' },
  { host: 'coorg.nic.in', scope: 'location', evidence: 'Kodagu district alias; seen in real pilot grounding results, not independently confirmed' },
  { host: 'ernakulam.nic.in', scope: 'location', evidence: 'Ernakulam (Kochi) district official site (confirmed by web research)' },
  { host: 'vijayanagara.nic.in', scope: 'location', evidence: 'Vijayanagara (Hampi) district official site (confirmed by web research)' },
  { host: 'idukki.nic.in', scope: 'location', evidence: 'Idukki (Munnar) district official site (confirmed by web research)' },
  { host: 'dtpcidukki.com', scope: 'location', evidence: 'District Tourism Promotion Council Idukki; has a Munnar destination page (confirmed by web research)' },
];

// Exact hosts of reputable national news outlets (never wildcards: no blogs.* / user subdomains).
const NEWS_REGISTRY = [
  { host: 'thehindu.com', evidence: 'The Hindu; appeared in pilot results' },
  { host: 'timesofindia.indiatimes.com', evidence: 'Times of India; fetched in the live test' },
  { host: 'newindianexpress.com', evidence: 'The New Indian Express; fetched in the live test' },
  { host: 'deccanherald.com', evidence: 'Deccan Herald; appeared in web research' },
  { host: 'indianexpress.com', evidence: 'The Indian Express (national daily; exact host only)' },
  { host: 'hindustantimes.com', evidence: 'Hindustan Times (national daily; exact host only)' },
  { host: 'ndtv.com', evidence: 'NDTV (national broadcaster; exact host only)' },
  { host: 'livelaw.in', evidence: 'LiveLaw (legal news; appeared in pilot results)' },
];

const hostsWhere = pred => new Set(OFFICIAL_REGISTRY.filter(pred).map(e => e.host));
const NATIONAL_OFFICIAL = [...hostsWhere(e => e.scope === 'national')];
const STATE_OFFICIAL = {
  karnataka: [...hostsWhere(e => e.scope === 'karnataka')],
  kerala: [...hostsWhere(e => e.scope === 'kerala')],
};
const LOCATION_REGISTERED = hostsWhere(e => e.scope === 'location');
const NEWS_HOSTS = NEWS_REGISTRY.map(e => e.host);

const isImageUrl = u => IMAGE_EXT_RE.test(u.pathname);
const isVertexRedirect = u => u.hostname === 'vertexaisearch.cloud.google.com' && u.pathname.startsWith('/grounding-api-redirect/');

function parseUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

const bareHost = h => h.toLowerCase().replace(/^www\./, '');

// Hosts this location may treat as official: national + its state + its own REGISTERED hosts.
function officialHostsFor(location) {
  const state = String(location?.state_name || '').toLowerCase();
  const stateHosts = location ? STATE_OFFICIAL[state] || [] : Object.values(STATE_OFFICIAL).flat();
  const own = (location?.officialHosts || []).filter(h => LOCATION_REGISTERED.has(h)); // unregistered = ignored
  return new Set([...NATIONAL_OFFICIAL, ...stateHosts, ...own]);
}

// -> { tier: 'official' | 'news' | null, reason: string | null }
function classifySource(url, location) {
  const u = parseUrl(url);
  if (!u) return { tier: null, reason: 'invalid_url' };
  if (u.protocol !== 'https:') return { tier: null, reason: 'not_https' };
  if (isVertexRedirect(u)) return { tier: null, reason: 'redirect' };
  if (isImageUrl(u)) return { tier: null, reason: 'image' };

  const host = bareHost(u.hostname);
  if (officialHostsFor(location).has(host)) return { tier: 'official', reason: null };
  if (NEWS_HOSTS.includes(host)) return { tier: 'news', reason: null };
  return { tier: null, reason: 'untrusted_domain' };
}

// Per-location predicate for the fetcher: true when the URL may be requested.
const allowUrlFor = location => url => classifySource(url, location).tier !== null;

module.exports = {
  classifySource, allowUrlFor, officialHostsFor,
  OFFICIAL_REGISTRY, NEWS_REGISTRY, NATIONAL_OFFICIAL, STATE_OFFICIAL, NEWS_HOSTS,
};
