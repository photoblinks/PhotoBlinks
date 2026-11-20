// Local JSON file cache (no database). One file per entry: <dir>/<kind>/<sha256>.json
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cfg = require('./config');

const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeKey(key) {
  return String(key).trim().toLowerCase().replace(/\s+/g, ' ');
}

function createCache(dir, { now = Date.now } = {}) {
  const fileFor = (kind, key) => {
    if (!cfg.CACHE_TTL_DAYS[kind]) throw new Error(`Unknown cache kind "${kind}"`);
    const hash = crypto.createHash('sha256').update(normalizeKey(key)).digest('hex').slice(0, 40);
    return path.join(dir, kind, `${hash}.json`);
  };

  return {
    dir,
    get(kind, key) {
      const file = fileFor(kind, key); // validates kind; must not be swallowed below
      try {
        const entry = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (now() - entry.storedAt > cfg.CACHE_TTL_DAYS[kind] * DAY_MS) return undefined;
        return entry.value;
      } catch {
        return undefined;
      }
    },
    set(kind, key, value) {
      const file = fileFor(kind, key);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ storedAt: now(), value }));
    },
  };
}

module.exports = { createCache };
