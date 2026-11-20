// Article dates, for rejecting OUTDATED NEWS used as evidence of current conditions.
// Pure functions. Strategy order (first one that yields a date wins, earliest date within it):
//   1. page metadata (JSON-LD datePublished, article:published_time, <time datetime>)
//   2. date in the URL (/2026/Apr/29/, /2022/10/27/, /2024-03-05/)
//   3. a full date in the first part of the page text ("Apr 28, 2026", "28 April 2026", "2026-04-28")
// An undated article is treated as NOT fresh (fail-closed).
const MONTHS = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_YEAR = 1995;
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

function utc(year, month, day) {
  const d = new Date(Date.UTC(year, month, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month && d.getUTCDate() === day ? d : null;
}

// Loose parse of one date string; null when it is not a recognisable full date.
function parseDate(s) {
  const str = String(s).trim();
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return utc(+m[1], +m[2] - 1, +m[3]);
  m = str.match(new RegExp(`^${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})`, 'i'));
  if (m) return utc(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
  m = str.match(new RegExp(`^(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE}\\.?,?\\s+(\\d{4})`, 'i'));
  if (m) return utc(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  return null;
}

const META_NAMES = 'article:published_time|og:published_time|datepublished|pubdate|publishdate|publish-date|dc\\.date\\.issued|dc\\.date|date';

function fromMetadata(html) {
  const found = [];
  const add = s => { const d = parseDate(s); if (d) found.push(d); };
  for (const m of html.matchAll(/"datePublished"\s*:\s*"([^"]+)"/gi)) add(m[1]);
  for (const m of html.matchAll(new RegExp(`<meta[^>]+(?:property|name|itemprop)\\s*=\\s*["'](?:${META_NAMES})["'][^>]*content\\s*=\\s*["']([^"']+)["']`, 'gi'))) add(m[1]);
  for (const m of html.matchAll(new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']+)["'][^>]*(?:property|name|itemprop)\\s*=\\s*["'](?:${META_NAMES})["']`, 'gi'))) add(m[1]);
  for (const m of html.matchAll(/<time[^>]+datetime\s*=\s*["']([^"']+)["']/gi)) add(m[1]);
  return found;
}

function fromUrl(url) {
  let path;
  try { path = new URL(url).pathname; } catch { return []; }
  const found = [];
  let m = path.match(/\/(20\d{2})\/(\d{1,2})\/(\d{1,2})(?:\/|$)/);
  if (m) found.push(utc(+m[1], +m[2] - 1, +m[3]));
  m = path.match(new RegExp(`/(20\\d{2})/${MONTH_RE}/(\\d{1,2})(?:/|$)`, 'i'));
  if (m) found.push(utc(+m[1], MONTHS[m[2].toLowerCase()], +m[3]));
  m = path.match(/\/(20\d{2})-(\d{2})-(\d{2})(?:\/|-|$)/);
  if (m) found.push(utc(+m[1], +m[2] - 1, +m[3]));
  return found.filter(Boolean);
}

function fromText(text) {
  const head = String(text).slice(0, 2000);
  const found = [];
  const patterns = [
    /\b\d{4}-\d{2}-\d{2}\b/g,
    new RegExp(`\\b${MONTH_RE}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}\\b`, 'gi'),
    new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH_RE}\\.?,?\\s+\\d{4}\\b`, 'gi'),
  ];
  for (const re of patterns) for (const m of head.matchAll(re)) { const d = parseDate(m[0]); if (d) found.push(d); }
  return found;
}

// -> { date: Date, source: 'metadata' | 'url' | 'text' } | null
function extractPublishedDate({ url, html, text }, now = new Date()) {
  const plausible = d => d.getUTCFullYear() >= MIN_YEAR && d.getTime() <= now.getTime() + DAY_MS;
  const strategies = [
    ['metadata', () => (html ? fromMetadata(html) : [])],
    ['url', () => (url ? fromUrl(url) : [])],
    ['text', () => (text ? fromText(text) : [])],
  ];
  for (const [source, find] of strategies) {
    const dates = find().filter(plausible).sort((a, b) => a - b);
    if (dates.length > 0) return { date: dates[0], source };
  }
  return null;
}

// -> { fresh: boolean, reason: null | 'news_date_unknown' | 'news_outdated', ageDays: number | null }
function assessFreshness(publishedIso, now, maxAgeDays) {
  const d = publishedIso ? new Date(publishedIso) : null;
  if (!d || Number.isNaN(d.getTime())) return { fresh: false, reason: 'news_date_unknown', ageDays: null };
  const ageDays = Math.floor((now.getTime() - d.getTime()) / DAY_MS);
  if (ageDays > maxAgeDays) return { fresh: false, reason: 'news_outdated', ageDays };
  return { fresh: true, reason: null, ageDays };
}

module.exports = { extractPublishedDate, assessFreshness, parseDate };
