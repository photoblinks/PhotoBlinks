// Safe page fetching: https only, hosts must pass the caller's allowUrl policy (re-checked on
// every redirect hop), no IP literals, every resolved address must be public, and the
// connection is PINNED to the addresses that were validated (DNS-rebinding defence, see
// transport.js). robots.txt is respected; time and size are bounded.
const dns = require('node:dns');
const net = require('node:net');
const { isPrivateIp } = require('./net-safety');
const { parseRobots, robotsAllows } = require('./net-safety');
const { httpsTransport } = require('./transport');
const { allowUrlFor } = require('./source-policy');
const { extractPublishedDate } = require('./freshness');
const cfg = require('./config');

class FetchRejected extends Error {
  constructor(reason, detail) {
    super(detail ? `${reason}: ${detail}` : reason);
    this.name = 'FetchRejected';
    this.reason = reason;
  }
}

const defaultLookup = host => dns.promises.lookup(host, { all: true });
// With no location context only the shared (national/state/news) hosts pass.
const defaultAllowUrl = allowUrlFor(null);

// Resolve ONCE, validate every address, and return them for pinning.
async function assertSafeUrl(url, { lookup, allowUrl }) {
  let u;
  try { u = new URL(url); } catch { throw new FetchRejected('invalid_url'); }
  if (u.protocol !== 'https:') throw new FetchRejected('not_https');
  if (u.username || u.password) throw new FetchRejected('credentials_in_url');
  if (u.port) throw new FetchRejected('non_default_port');
  if (net.isIP(u.hostname.replace(/^\[|\]$/g, '')) !== 0) throw new FetchRejected('ip_literal');
  if (!allowUrl(u.href)) throw new FetchRejected('untrusted_domain', u.hostname);
  let addrs;
  try { addrs = await lookup(u.hostname); } catch { throw new FetchRejected('dns_failure', u.hostname); }
  if (!Array.isArray(addrs) || addrs.length === 0) throw new FetchRejected('dns_failure', u.hostname);
  if (addrs.some(a => isPrivateIp(a.address))) throw new FetchRejected('private_address', u.hostname);
  return { u, addresses: addrs.map(a => ({ address: a.address, family: a.family || net.isIP(a.address) })) };
}

async function readCapped(body, maxBytes) {
  const chunks = [];
  let size = 0;
  let truncated = false;
  for await (const chunk of body) {
    const buf = Buffer.from(chunk);
    size += buf.byteLength;
    if (size > maxBytes) {
      chunks.push(buf.subarray(0, buf.byteLength - (size - maxBytes)));
      truncated = true;
      body.destroy?.();
      break;
    }
    chunks.push(buf);
  }
  return { text: Buffer.concat(chunks).toString('utf8'), truncated };
}

// One GET with manual redirects. EVERY hop re-resolves, re-validates and re-pins.
async function safeGet(url, { lookup = defaultLookup, transport = httpsTransport, allowUrl = defaultAllowUrl, accept = 'text/html,text/plain', tls, signal } = {}) {
  let current = url;
  for (let hop = 0; hop <= cfg.MAX_REDIRECTS; hop++) {
    const { u, addresses } = await assertSafeUrl(current, { lookup, allowUrl });
    const res = await transport({
      url: u.href,
      hostname: u.hostname,
      path: u.pathname + u.search,
      addresses,
      headers: { 'User-Agent': cfg.USER_AGENT, Accept: accept },
      signal: AbortSignal.any([AbortSignal.timeout(cfg.PAGE_TIMEOUT_MS), ...(signal ? [signal] : [])]),
      tls,
    });
    if (res.status >= 300 && res.status < 400) {
      res.body?.destroy?.();
      const location = res.headers.get('location');
      if (!location) throw new FetchRejected('redirect_without_location');
      current = new URL(location, u.href).href;
      continue;
    }
    const { text, truncated } = await readCapped(res.body, cfg.PAGE_MAX_BYTES);
    return { status: res.status, contentType: res.headers.get('content-type') || '', text, truncated, finalUrl: u.href };
  }
  throw new FetchRejected('too_many_redirects');
}

async function robotsPermits(u, deps) {
  const key = u.origin;
  let text = deps.cache?.get('robots', key);
  if (text === undefined) {
    const r = await safeGet(`${u.origin}/robots.txt`, { ...deps, accept: 'text/plain' });
    if (r.status >= 500) throw new FetchRejected('robots_unavailable');
    text = r.status >= 400 ? '' : r.text; // 4xx: no robots rules
    deps.cache?.set('robots', key, text);
  }
  return robotsAllows(parseRobots(text), cfg.USER_AGENT, u.pathname + u.search);
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rupee: '₹' };

function htmlToText(html) {
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|head|nav|footer|form)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/?(p|div|li|ul|ol|tr|td|th|table|br|h[1-6]|section|article|header)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => safeCodePoint(parseInt(h, 16), m))
    .replace(/&#(\d+);/g, (m, d) => safeCodePoint(Number(d), m))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n[ \n]*/g, '\n')
    .trim();
}

function safeCodePoint(n, fallback) {
  try { return String.fromCodePoint(n); } catch { return fallback; }
}

// Fetch a page and return plain text. Never throws for expected rejections: returns { ok:false, reason }.
async function fetchPage(url, deps = {}) {
  // `??`, not a spread: an explicit `lookup: undefined` (live mode) must still get the default.
  const resolved = { ...deps, lookup: deps.lookup ?? defaultLookup, allowUrl: deps.allowUrl ?? defaultAllowUrl };
  try {
    const { u } = await assertSafeUrl(url, resolved);
    if (!(await robotsPermits(u, resolved))) return { ok: false, url, reason: 'robots_disallow' };
    const r = await safeGet(u.href, resolved);
    if (r.status < 200 || r.status >= 300) return { ok: false, url, reason: `http_${r.status}` };
    const type = r.contentType.toLowerCase();
    const isHtml = type.includes('text/html') || type.includes('application/xhtml');
    if (!isHtml && !type.includes('text/plain')) return { ok: false, url, reason: 'unsupported_content_type', detail: type.split(';')[0] };
    const text = isHtml ? htmlToText(r.text) : r.text.trim();
    if (text.length < 40) return { ok: false, url, reason: 'empty_page' };
    // Dates come from the raw HTML (metadata) before it is flattened to text.
    const found = extractPublishedDate({ url: r.finalUrl, html: isHtml ? r.text : '', text });
    return { ok: true, url: r.finalUrl, requestedUrl: url, text, truncated: r.truncated, published: found ? found.date.toISOString() : null };
  } catch (e) {
    if (e instanceof FetchRejected) return { ok: false, url, reason: e.reason, detail: e.message };
    return { ok: false, url, reason: 'fetch_error', detail: e.message, code: e.code };
  }
}

// Cached wrapper. The policy check runs BEFORE the cache, so a page cached under a broader
// policy can never be served once the host is no longer allowed. Failures are never cached.
function createPageGetter({ cache, transport, lookup, signal }) {
  return async function getPage(url, allowUrl = defaultAllowUrl) {
    if (!allowUrl(url)) return { ok: false, url, reason: 'untrusted_domain' };
    const hit = cache.get('page', url);
    if (hit && allowUrl(hit.url)) {
      // Pages cached before dates were recorded get a best-effort date from URL / text.
      const published = hit.published !== undefined ? hit.published : (extractPublishedDate({ url: hit.url, text: hit.text })?.date.toISOString() ?? null);
      return { ok: true, cached: true, requestedUrl: url, ...hit, published };
    }
    const page = await fetchPage(url, { transport, lookup, cache, allowUrl, signal });
    if (page.ok) cache.set('page', url, { url: page.url, text: page.text, truncated: page.truncated, published: page.published });
    return page;
  };
}

const KEYWORDS = /(fee|₹|\brs\b|inr|ticket|price|charge|entry|entrance|admission|free|photograph|pre-?wedding|shoot|filming|drone|uav|permit|permission|booking|advance|apply|application|noc|dgca|restricted|prohibited|allowed)/i;

// Keep the most relevant lines (in original order) up to maxChars, so the model sees the
// fee / permission passages instead of page chrome.
function relevantExcerpt(text, maxChars) {
  if (text.length <= maxChars) return text;
  const lines = text.split('\n');
  const keep = new Set();
  let size = 0;
  for (let i = 0; i < lines.length && size < maxChars; i++) {
    if (!KEYWORDS.test(lines[i])) continue;
    for (const j of [i - 1, i, i + 1]) {
      if (j >= 0 && j < lines.length && !keep.has(j) && size + lines[j].length + 1 <= maxChars) {
        keep.add(j);
        size += lines[j].length + 1;
      }
    }
  }
  const out = [...keep].sort((a, b) => a - b).map(i => lines[i]).join('\n');
  return out || text.slice(0, maxChars);
}

module.exports = { createPageGetter, fetchPage, safeGet, htmlToText, relevantExcerpt, FetchRejected };
